import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Optional,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MailComposer = require('nodemailer/lib/mail-composer');
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { simpleParser } from 'mailparser';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SendEmailDto } from './dto/send-email.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import {
  QUEUE_EMAIL,
  EMAIL_JOB_SEND,
} from '../../queue/queue.constants';
import { EmailTrackingService } from './email-tracking.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { EmailCustomerMatcher } from './email-customer-matcher.service';
import { ImapSyncService } from './imap-sync.service';
import { isSpam, makeSnippet } from './email-utils';
import { createImap, findSentFolder } from './imap-utils';

/** 调用方身份（来自 JwtStrategy.validate 返回的 user）。 */
export interface EmailActor {
  id: string;
  role: string;
  isSuperAdmin?: boolean;
}

/**
 * 列表接口返回的字段：不含 bodyHtml / bodyText（内嵌图片以 base64 存在
 * bodyHtml 里，一封就可能几 MB），预览用 snippet。正文在详情接口里取。
 */
const EMAIL_LIST_SELECT = {
  id: true,
  messageId: true,
  threadId: true,
  emailConfigId: true,
  fromAddr: true,
  fromName: true,
  toAddr: true,
  cc: true,
  subject: true,
  snippet: true,
  direction: true,
  status: true,
  category: true,
  flagged: true,
  sentAt: true,
  receivedAt: true,
  viewedAt: true,
  viewCount: true,
  firstHumanOpenAt: true,
  openConfidence: true,
  totalClicks: true,
  customerId: true,
  senderId: true,
  campaignId: true,
  createdAt: true,
  customer: { select: { id: true, companyName: true } },
  sender: { select: { id: true, name: true, email: true } },
  emailConfig: { select: { emailAddr: true } },
  // 只用来在列表上画回形针；内嵌图片由调用方过滤
  attachments: { select: { id: true, isInline: true } },
} satisfies Prisma.EmailSelect;

@Injectable()
export class EmailsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: EmailTrackingService,
    private readonly followUps: FollowUpsService,
    private readonly matcher: EmailCustomerMatcher,
    private readonly imapSync: ImapSyncService,
    @Optional()
    @InjectQueue(QUEUE_EMAIL)
    private readonly emailQueue?: Queue,
  ) {}

  // ==================== Access control ====================
  //
  // 读权限：邮件在自己配置的邮箱账户里；或邮件关联客户的负责人；或超管。
  // 写权限（星标 / 分类 / 删除 / 已读）：只有邮箱账户的主人（和超管）——
  // 客户负责人能看同事与该客户的往来，但不能动同事邮箱里的邮件。
  // emailConfigId 为空的历史邮件按 senderId 归属。

  private mailboxWhere(actor: EmailActor): Prisma.EmailWhereInput {
    if (actor.isSuperAdmin) return {};
    return {
      OR: [
        { emailConfig: { userId: actor.id } },
        { emailConfigId: null, senderId: actor.id },
      ],
    };
  }

  private readableWhere(actor: EmailActor): Prisma.EmailWhereInput {
    if (actor.isSuperAdmin) return {};
    return {
      OR: [
        { emailConfig: { userId: actor.id } },
        { emailConfigId: null, senderId: actor.id },
        { customer: { ownerId: actor.id } },
      ],
    };
  }

  /** 读校验：不存在 → 404，无权 → 403。 */
  private async assertCanRead(id: string, actor: EmailActor) {
    const email = await this.prisma.email.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!email) throw new NotFoundException('Email not found');
    const allowed = await this.prisma.email.count({
      where: { AND: [{ id }, this.readableWhere(actor)] },
    });
    if (!allowed) throw new ForbiddenException('无权访问该邮件');
  }

  /** 写校验：只有邮箱主人 / 超管。返回邮件行。 */
  private async assertCanModify(id: string, actor: EmailActor) {
    const email = await this.prisma.email.findFirst({
      where: { AND: [{ id }, this.mailboxWhere(actor)] },
    });
    if (email) return email;
    const exists = await this.prisma.email.count({ where: { id } });
    if (!exists) throw new NotFoundException('Email not found');
    throw new ForbiddenException('无权操作该邮件');
  }

  /** 给 controller 用：追踪详情等只读接口复用同一套读权限。 */
  async ensureCanRead(id: string, actor: EmailActor) {
    await this.assertCanRead(id, actor);
  }

  private isAdmin(actor: EmailActor) {
    return actor.isSuperAdmin || actor.role === 'ADMIN';
  }

  // ==================== snippet 回填 ====================

  onApplicationBootstrap() {
    // 不阻塞启动；多实例同时跑也无害（写的是同样的值）
    setTimeout(() => {
      this.backfillSnippets().catch((e) =>
        this.logger.warn(`snippet backfill stopped: ${e?.message || e}`),
      );
    }, 10_000);
  }

  /** 给升级前的老邮件分批生成 snippet。没有正文的写空串，避免反复处理。 */
  async backfillSnippets(batchSize = 200): Promise<number> {
    let total = 0;
    for (;;) {
      const rows = await this.prisma.email.findMany({
        where: { snippet: null },
        select: { id: true, bodyText: true, bodyHtml: true },
        take: batchSize,
      });
      if (rows.length === 0) break;
      await this.prisma.$transaction(
        rows.map((r) =>
          this.prisma.email.update({
            where: { id: r.id },
            data: { snippet: makeSnippet(r.bodyText, r.bodyHtml) },
          }),
        ),
      );
      total += rows.length;
      // 给正常请求让出数据库
      await new Promise((r) => setTimeout(r, 50));
    }
    if (total > 0) this.logger.log(`Backfilled snippet for ${total} email(s)`);
    return total;
  }

  private stripTrackingPixel(html: string | null): string | null {
    if (!html) return html;
    return html.replace(/<img[^>]*\/api\/emails\/track\/[^>]*>/gi, '');
  }

  private normalizeSubject(subject: string): string {
    return subject
      .replace(/^(re|fwd|fw|回复|转发)\s*[:：]\s*/gi, '')
      .replace(/^(re|fwd|fw|回复|转发)\s*[:：]\s*/gi, '')
      .trim() || '(No Subject)';
  }

  /**
   * Always create a fresh thread. The old logic tried to reuse threads
   * by matching on normalized subject alone, which caused unrelated
   * emails with the same subject (e.g. "test") to get merged. Now we
   * only reuse a thread via explicit reply chains (inReplyTo / IMAP
   * In-Reply-To + References headers).
   */
  private async createThread(subject: string): Promise<string> {
    const normalized = this.normalizeSubject(subject);
    const thread = await this.prisma.emailThread.create({
      data: { subject: normalized },
    });
    return thread.id;
  }

  // ==================== Email Account Management ====================

  async listEmailAccounts(userId: string) {
    const accounts = await this.prisma.emailConfig.findMany({
      where: { userId },
      select: {
        id: true,
        emailAddr: true,
        fromName: true,
        createdAt: true,
        lastSyncAt: true,
        lastSyncAttemptAt: true,
        lastSyncError: true,
        syncFailCount: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return { accounts };
  }

  async getEmailAccount(userId: string, configId: string) {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
    });

    if (!config) {
      throw new NotFoundException('Email configuration not found');
    }

    return {
      id: config.id,
      emailAddr: config.emailAddr,
      fromName: config.fromName || '',
      signature: config.signature || '',
      smtpHost: config.smtpHost,
      smtpPort: config.smtpPort,
      smtpUser: config.smtpUser,
      smtpPass: '********',
      smtpSecure: config.smtpSecure,
      imapHost: config.imapHost,
      imapPort: config.imapPort,
      imapUser: config.imapUser,
      imapPass: '********',
      imapSecure: config.imapSecure,
    };
  }

  async createEmailAccount(userId: string, data: any) {
    const { emailAddr, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, imapHost, imapPort, imapUser, imapPass, imapSecure, fromName, signature } = data;

    if (!emailAddr || !smtpHost || !smtpUser || !imapHost) {
      throw new BadRequestException('Missing required email configuration fields');
    }

    const config = await this.prisma.emailConfig.create({
      data: {
        userId,
        emailAddr,
        smtpHost,
        smtpPort: Number(smtpPort) || 465,
        smtpUser,
        smtpPass,
        smtpSecure: smtpSecure !== false,
        imapHost,
        imapPort: Number(imapPort) || 993,
        imapUser: imapUser || smtpUser,
        imapPass: imapPass || smtpPass,
        imapSecure: imapSecure !== false,
        fromName: fromName || undefined,
        signature: signature || undefined,
      },
      select: {
        id: true,
        emailAddr: true,
        fromName: true,
        createdAt: true,
      },
    });

    return { config };
  }

  async updateEmailAccount(userId: string, configId: string, data: any) {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
    });

    if (!config) {
      throw new NotFoundException('Email configuration not found');
    }

    const updated = await this.prisma.emailConfig.update({
      where: { id: configId },
      data: {
        fromName: data.fromName || config.fromName,
        signature: data.signature || config.signature,
        smtpHost: data.smtpHost || config.smtpHost,
        smtpPort: data.smtpPort ? Number(data.smtpPort) : config.smtpPort,
        smtpUser: data.smtpUser || config.smtpUser,
        smtpPass: data.smtpPass && data.smtpPass !== '********' ? data.smtpPass : config.smtpPass,
        smtpSecure: data.smtpSecure !== undefined ? data.smtpSecure : config.smtpSecure,
        imapHost: data.imapHost || config.imapHost,
        imapPort: data.imapPort ? Number(data.imapPort) : config.imapPort,
        // IMAP user/pass: if left blank, fall back to SMTP credentials.
        imapUser: data.imapUser || data.smtpUser || config.imapUser,
        imapPass: data.imapPass && data.imapPass !== '********'
          ? data.imapPass
          : data.smtpPass && data.smtpPass !== '********'
            ? data.smtpPass
            : config.imapPass,
        imapSecure: data.imapSecure !== undefined ? data.imapSecure : config.imapSecure,
      },
      select: {
        id: true,
        emailAddr: true,
        fromName: true,
      },
    });

    return { config: updated };
  }

  async deleteEmailAccount(userId: string, configId: string) {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
    });

    if (!config) {
      throw new NotFoundException('Email configuration not found');
    }

    // Delete the config and all associated emails in a single transaction.
    // Even though the DB has ON DELETE CASCADE, we do this explicitly so the
    // email count is logged and the intent is clear in code.
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.email.deleteMany({
        where: { emailConfigId: configId },
      });

      await tx.emailConfig.delete({
        where: { id: configId },
      });

      return { deletedEmails: count };
    });

    this.logger.log(
      `Deleted email config ${configId} for user ${userId}, removed ${result.deletedEmails} associated emails`,
    );

    return { deleted: true, deletedEmails: result.deletedEmails };
  }

  async testEmailAccount(userId: string, configId: string) {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
    });

    if (!config) {
      throw new NotFoundException('Email configuration not found');
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
        connectionTimeout: 10000,
      });

      await transporter.verify();

      return {
        success: true,
        message: 'SMTP connection successful',
      };
    } catch (error) {
      return {
        success: false,
        message: `SMTP connection failed: ${error.message}`,
      };
    }
  }

  // ==================== Send Email ====================

  async sendEmail(userId: string, dto: SendEmailDto, requestOrigin?: string) {
    let config: any;

    if (dto.emailConfigId) {
      config = await this.prisma.emailConfig.findFirst({
        where: { id: dto.emailConfigId, userId },
      });
    } else {
      config = await this.prisma.emailConfig.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
    }

    if (!config) {
      throw new BadRequestException(
        'Email configuration not found. Please configure your SMTP settings first.',
      );
    }

    let htmlBody = dto.bodyHtml;
    // 如果前端已经显式把签名嵌入到了正文里（例如 ComposeWindow 的可视化
    // 编辑器），就不要再次追加，否则收件人会看到两份签名。
    if (config.signature && !dto.skipSignatureAppend) {
      htmlBody += `<br/><br/>--<br/>${config.signature}`;
    }

    let inReplyToMessageId: string | undefined;
    let threadId: string | undefined;

    if (dto.inReplyTo) {
      // 只能回复自己看得到的邮件，否则不挂线程也不带 In-Reply-To。
      const originalEmail = await this.prisma.email.findFirst({
        where: {
          AND: [{ id: dto.inReplyTo }, this.readableWhere({ id: userId, role: '' })],
        },
      });
      if (originalEmail) {
        inReplyToMessageId = originalEmail.messageId || undefined;
        if (originalEmail.threadId) {
          threadId = originalEmail.threadId;
        } else {
          const thread = await this.prisma.emailThread.create({
            data: { subject: originalEmail.subject },
          });
          threadId = thread.id;
          await this.prisma.email.update({
            where: { id: originalEmail.id },
            data: { threadId: thread.id },
          });
        }
      }
    }

    if (!threadId) {
      threadId = await this.createThread(dto.subject);
    }

    let customerId = dto.customerId || null;
    let category = 'sent';
    if (!customerId) {
      const matched = await this.matcher.match(dto.toAddr);
      if (matched) {
        customerId = matched.id;
        category = 'customer';
      }
    } else {
      category = 'customer';
    }

    // Resolve / upsert the recipient (cross-email aggregation keyed by
    // toAddr) and validate the campaign if the caller passed one.
    const recipient = await this.tracking.resolveRecipient(dto.toAddr, {
      customerId: customerId || undefined,
    });
    let campaignId: string | null = null;
    if (dto.campaignId) {
      const campaign = await this.prisma.emailCampaign.findUnique({
        where: { id: dto.campaignId },
        select: { id: true },
      });
      if (campaign) campaignId = campaign.id;
    }

    const emailRecord = await this.prisma.email.create({
      data: {
        fromAddr: config.emailAddr,
        fromName: config.fromName || null,
        toAddr: dto.toAddr,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        bodyHtml: htmlBody,
        snippet: makeSnippet(null, htmlBody),
        direction: 'OUTBOUND',
        status: 'DRAFT',
        category,
        customerId,
        senderId: userId,
        emailConfigId: config.id,
        threadId: threadId || null,
        recipientId: recipient.id,
        campaignId,
      },
      include: { customer: true },
    });

    // Bump recipient.totalSent + lastSentAt immediately so aggregates
    // stay accurate even if the SMTP send later fails.
    await this.prisma.emailRecipient.update({
      where: { id: recipient.id },
      data: {
        totalSent: { increment: 1 },
        lastSentAt: new Date(),
      },
    });

    // 把上传过的附件文档挂到这封邮件上（relatedType='email' + relatedId
    // = 邮件 id）。只接受当前用户上传的文件，防止用别人的 Document id
    // 把他人的文件带出去。之后 deliverPendingEmail 会按同样的 where 找
    // 这些附件。
    if (dto.attachmentIds && dto.attachmentIds.length > 0) {
      await this.prisma.document.updateMany({
        where: {
          id: { in: dto.attachmentIds },
          ownerId: userId,
        },
        data: {
          relatedType: 'email',
          relatedId: emailRecord.id,
          category: 'email-attachment',
        },
      });
    }

    const requestOriginForTracking =
      process.env.APP_URL || process.env.PUBLIC_URL || requestOrigin || '';

    // Enqueue the SMTP delivery so the HTTP request returns immediately.
    // If BullMQ/Redis is unavailable, fall back to synchronous send so
    // existing behaviour still works.
    if (this.emailQueue) {
      await this.emailQueue.add(
        EMAIL_JOB_SEND,
        {
          emailId: emailRecord.id,
          userId,
          requestOrigin: requestOriginForTracking,
          inReplyToMessageId,
        },
        {
          jobId: `send-${emailRecord.id}`,
        },
      );
      return emailRecord;
    }

    // Fallback: inline delivery (no queue configured).
    this.logger.warn(
      'Email queue not configured — falling back to synchronous send',
    );
    try {
      return await this.deliverPendingEmail(emailRecord.id, {
        requestOrigin: requestOriginForTracking,
        inReplyToMessageId,
        actingUserId: userId,
      });
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to send email: ${error?.message || error}`,
      );
    }
  }

  /**
   * Worker-side SMTP delivery. Looks up the persisted DRAFT email record
   * and actually sends it, updating status to SENT or FAILED.
   * Safe to retry: noop if the email is already SENT.
   */
  async deliverPendingEmail(
    emailId: string,
    opts: {
      requestOrigin?: string;
      inReplyToMessageId?: string;
      actingUserId?: string;
    } = {},
  ) {
    const emailRecord = await this.prisma.email.findUnique({
      where: { id: emailId },
    });
    if (!emailRecord) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }
    if (emailRecord.status === 'SENT') {
      return emailRecord;
    }
    if (!emailRecord.emailConfigId) {
      throw new BadRequestException('Email record has no emailConfigId');
    }

    const config = await this.prisma.emailConfig.findUnique({
      where: { id: emailRecord.emailConfigId },
    });
    if (!config) {
      await this.prisma.email.update({
        where: { id: emailId },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException('Email configuration no longer exists');
    }

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });

    const fromAddress = config.fromName
      ? `"${config.fromName}" <${config.emailAddr}>`
      : config.emailAddr;

    const appUrl = opts.requestOrigin || '';
    // Multi-signal tracking: rewrite every <a href> through the click
    // redirector AND append a 1×1 pixel. Pixel alone is blocked by Gmail
    // proxy caching / Apple MPP; wrapped links pick up the slack.
    const htmlWithTracking = await this.tracking.rewriteEmailHtml(
      emailRecord.id,
      emailRecord.bodyHtml || '',
      appUrl,
    );

    // 预先定死 Message-Id：SMTP 发出去的和 IMAP APPEND 回服务器的要一致，
    // 这样其它客户端收到的 sent 副本才和收件箱里的往来能匹配起来。
    const domain = (config.emailAddr.split('@')[1] || 'localhost').trim();
    const presetMessageId = `<${uuidv4()}@${domain}>`;

    const mailOptions: any = {
      from: fromAddress,
      to: emailRecord.toAddr,
      cc: emailRecord.cc || undefined,
      bcc: emailRecord.bcc || undefined,
      subject: emailRecord.subject,
      html: htmlWithTracking,
      messageId: presetMessageId,
    };

    if (opts.inReplyToMessageId) {
      mailOptions.inReplyTo = opts.inReplyToMessageId;
      mailOptions.references = [opts.inReplyToMessageId];
    }

    // 装载附件 —— 查这封邮件关联的 Document 行。用磁盘路径的形式交给
    // nodemailer，大文件不需要读进内存。丢失文件（比如 uploads 被清）
    // 的行会被跳过并记日志，不让整封邮件失败。
    const attachmentDocs = await this.prisma.document.findMany({
      where: { relatedType: 'email', relatedId: emailRecord.id },
      select: { id: true, fileName: true, filePath: true, mimeType: true },
    });
    if (attachmentDocs.length > 0) {
      const nmAttachments: any[] = [];
      for (const d of attachmentDocs) {
        if (d.filePath && fs.existsSync(d.filePath)) {
          nmAttachments.push({
            filename: d.fileName,
            path: d.filePath,
            contentType: d.mimeType || undefined,
          });
        } else {
          this.logger.warn(
            `Attachment file missing on disk, skipping: ${d.fileName} (${d.filePath})`,
          );
        }
      }
      if (nmAttachments.length > 0) {
        mailOptions.attachments = nmAttachments;
      }
    }

    try {
      const info = await transporter.sendMail(mailOptions);

      const email = await this.prisma.email.update({
        where: { id: emailRecord.id },
        data: {
          messageId: info.messageId,
          status: 'SENT',
          sentAt: new Date(),
        },
        include: { customer: true },
      });

      if (email.customerId) {
        const ownerId = opts.actingUserId || emailRecord.senderId || undefined;
        if (ownerId) {
          await this.prisma.activity
            .create({
              data: {
                type: 'EMAIL',
                content: `发送邮件 - 收件人: ${email.toAddr}，主题: ${email.subject}`,
                customerId: email.customerId,
                ownerId,
                relatedType: 'email',
                relatedId: email.id,
              },
            })
            .catch(() => {});
        }
      }

      // 跟进钩子：收件人如命中 Lead 则自动建/续期一条 PENDING 跟进。
      // 错误不传播，不影响主流程。
      await this.followUps.createForOutboundEmail({
        id: email.id,
        toAddr: email.toAddr,
        customerId: email.customerId,
        senderId: email.senderId,
      });

      // 把发出去的邮件 APPEND 到 IMAP Sent 文件夹，保证其它邮箱客户端
      // （手机 / 网页 / Outlook 等）也能看到本系统发出的邮件。
      // 纯 best-effort：失败只记日志，不影响主流程（SMTP 已送达）。
      this.appendToImapSent(config, mailOptions).catch((err) =>
        this.logger.warn(
          `IMAP APPEND to Sent folder failed for ${emailId}: ${err?.message || err}`,
        ),
      );

      return email;
    } catch (error: any) {
      this.logger.error(
        `Failed to send email ${emailId}: ${error?.message}`,
        error?.stack,
      );
      await this.prisma.email.update({
        where: { id: emailId },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  // ==================== List Emails ====================

  async findAll(
    userId: string,
    role: string,
    query: {
      customerId?: string;
      direction?: string;
      status?: string;
      page?: number;
      pageSize?: number;
      grouped?: string;
      emailConfigId?: string;
      category?: string;
      flagged?: string;
      search?: string;
    },
    isSuperAdmin?: boolean,
  ) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (query.customerId) {
      // 客户上下文：只有"客户 owner"或超级管理员能看邮件 tab。
      // 普通管理员、其他销售、其他角色都拒绝——邮件涉及对方真实邮箱，
      // 视作敏感数据交给 owner 一手管理。
      const customer = await this.prisma.customer.findUnique({
        where: { id: query.customerId },
        select: { ownerId: true },
      });
      if (!customer) {
        throw new ForbiddenException('Customer not found');
      }
      const isOwner = customer.ownerId === userId;
      if (!isOwner && !isSuperAdmin) {
        throw new ForbiddenException(
          '只有客户负责人或超级管理员可以查看该客户的邮件',
        );
      }
      where.customerId = query.customerId;
    } else {
      // 非客户上下文（邮件中心 / 收件箱）：维持原行为，
      // 只看自己配置的邮箱账户里的邮件。
      const myConfigs = await this.prisma.emailConfig.findMany({
        where: { userId },
        select: { id: true },
      });
      const myIds = myConfigs.map((c) => c.id);
      // 传了 emailConfigId 也只能是自己的账户，否则直接返回空列表。
      where.emailConfigId = query.emailConfigId
        ? { in: myIds.includes(query.emailConfigId) ? [query.emailConfigId] : [] }
        : { in: myIds };
    }

    if (query.direction) {
      where.direction = query.direction;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.emailConfigId && query.customerId) {
      where.emailConfigId = query.emailConfigId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.flagged === 'true') {
      where.flagged = true;
    }

    // Full-text-ish search across subject / addresses / body.
    // Backed by pg_trgm GIN indexes (migration 20260421000000).
    if (query.search && query.search.trim()) {
      const q = query.search.trim();
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { fromAddr: { contains: q, mode: 'insensitive' } },
        { toAddr: { contains: q, mode: 'insensitive' } },
        { bodyText: { contains: q, mode: 'insensitive' } },
      ];
    }

    let orderBy: any;
    if (query.direction === 'INBOUND') {
      orderBy = [{ receivedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
    } else if (query.direction === 'OUTBOUND') {
      orderBy = [{ sentAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
    } else {
      orderBy = [
        { sentAt: { sort: 'desc', nulls: 'last' } },
        { receivedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ];
    }

    if (query.grouped === 'true') {
      return this.findAllThreaded(where, orderBy, page, pageSize, query.direction);
    }

    const [items, total] = await Promise.all([
      this.prisma.email.findMany({
        where,
        select: EMAIL_LIST_SELECT,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.email.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  // ==================== Email Detail ====================

  async findOne(id: string, actor: EmailActor) {
    await this.assertCanRead(id, actor);

    const email = await this.prisma.email.findFirst({
      where: { id },
      include: {
        customer: true,
        sender: { select: { id: true, name: true, email: true } },
        emailConfig: { select: { emailAddr: true } },
        attachments: {
          // 只暴露前端需要的字段；storagePath / imapUid 等是后端实现细节。
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            size: true,
            isInline: true,
            contentId: true,
            downloadedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        thread: {
          include: {
            emails: {
              // 老数据里线程可能跨了多个同事的邮箱，只带出自己看得到的。
              where: this.readableWhere(actor),
              orderBy: [
                { receivedAt: { sort: 'asc', nulls: 'last' } },
                { sentAt: { sort: 'asc', nulls: 'last' } },
                { createdAt: 'asc' },
              ],
              include: {
                sender: { select: { id: true, name: true, email: true } },
                customer: { select: { id: true, companyName: true } },
                attachments: {
                  select: {
                    id: true,
                    fileName: true,
                    mimeType: true,
                    size: true,
                    isInline: true,
                    contentId: true,
                    downloadedAt: true,
                  },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    const result: any = { ...email };
    result.bodyHtml = this.stripTrackingPixel(email.bodyHtml);
    if (result.thread?.emails) {
      result.thread.emails = result.thread.emails.map((e: any) => ({
        ...e,
        bodyHtml: this.stripTrackingPixel(e.bodyHtml),
      }));
    }

    return result;
  }

  private async findAllThreaded(
    where: any,
    _orderBy: any,
    page: number,
    pageSize: number,
    direction?: string,
  ) {
    const skip = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (where.senderId) {
      conditions.push(`e.sender_id = $${paramIdx++}`);
      params.push(where.senderId);
    }
    if (where.customerId) {
      conditions.push(`e.customer_id = $${paramIdx++}`);
      params.push(where.customerId);
    }
    if (where.direction) {
      conditions.push(`e.direction::text = $${paramIdx++}`);
      params.push(where.direction);
    }
    if (where.status) {
      conditions.push(`e.status::text = $${paramIdx++}`);
      params.push(where.status);
    }
    if (where.emailConfigId) {
      if (typeof where.emailConfigId === 'object' && where.emailConfigId.in) {
        const ids: string[] = where.emailConfigId.in;
        if (ids.length === 0) {
          // 没有任何可见账户：IN () 是语法错误，直接恒假。
          conditions.push('FALSE');
        } else {
          const placeholders = ids.map(() => `$${paramIdx++}`).join(', ');
          conditions.push(`e.email_config_id IN (${placeholders})`);
          params.push(...ids);
        }
      } else {
        conditions.push(`e.email_config_id = $${paramIdx++}`);
        params.push(where.emailConfigId);
      }
    }
    if (where.category) {
      conditions.push(`e.category = $${paramIdx++}`);
      params.push(where.category);
    }
    if (where.flagged) {
      conditions.push(`e.flagged = true`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT COALESCE(e.thread_id, e.id)) as cnt FROM emails e ${whereClause}`,
      ...params,
    );
    const total = Number(countResult[0]?.cnt || 0);

    const dateExpr = direction === 'INBOUND'
      ? 'COALESCE(e.received_at, e.created_at)'
      : direction === 'OUTBOUND'
      ? 'COALESCE(e.sent_at, e.created_at)'
      : 'COALESCE(e.sent_at, e.received_at, e.created_at)';

    const threadRows: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT
        COALESCE(e.thread_id, e.id) as group_id,
        COUNT(*) as email_count,
        MAX(${dateExpr}) as latest_date
      FROM emails e
      ${whereClause}
      GROUP BY group_id
      ORDER BY latest_date DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params,
      pageSize,
      skip,
    );

    const groupIds = threadRows.map((r: any) => r.group_id);

    // Apply the same filters to latestEmails so inbox shows latest INBOUND email,
    // sent folder shows latest OUTBOUND email, etc.
    const latestEmailsWhere: any = {
      OR: [
        { id: { in: groupIds } },
        { threadId: { in: groupIds } },
      ],
    };
    if (where.direction) latestEmailsWhere.direction = where.direction;
    if (where.category) latestEmailsWhere.category = where.category;
    if (where.senderId) latestEmailsWhere.senderId = where.senderId;
    if (where.customerId) latestEmailsWhere.customerId = where.customerId;
    if (where.emailConfigId) latestEmailsWhere.emailConfigId = where.emailConfigId;

    const latestEmails = await this.prisma.email.findMany({
      where: latestEmailsWhere,
      select: EMAIL_LIST_SELECT,
    });

    const results = threadRows.map((row: any) => {
      const emails = latestEmails.filter(
        (e: any) => (e.threadId === row.group_id || e.id === row.group_id),
      );
      const latestEmail = emails.sort(
        (a: any, b: any) =>
          new Date(b.sentAt || b.receivedAt || b.createdAt).getTime() -
          new Date(a.sentAt || a.receivedAt || a.createdAt).getTime(),
      )[0];

      // 只要线程里任意一封邮件有非内嵌附件，就在列表封面上标一个回形针。
      const hasAttachments = emails.some((e: any) =>
        (e.attachments || []).some((a: any) => !a.isInline),
      );

      return {
        threadId: row.group_id === latestEmail?.id ? null : row.group_id,
        threadSubject: latestEmail?.subject || '(No Subject)',
        emailCount: row.email_count,
        hasAttachments,
        latestEmail,
      };
    });

    return { items: results, total, page, pageSize };
  }

  async findThreadEmails(threadId: string, actor: EmailActor) {
    const emails = await this.prisma.email.findMany({
      where: { AND: [{ threadId }, this.readableWhere(actor)] },
      include: {
        customer: { select: { id: true, companyName: true } },
        sender: { select: { id: true, name: true, email: true } },
        attachments: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            size: true,
            isInline: true,
            contentId: true,
            downloadedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [
        { receivedAt: { sort: 'asc', nulls: 'last' } },
        { sentAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });

    return emails.map((e) => ({ ...e, bodyHtml: this.stripTrackingPixel(e.bodyHtml) }));
  }

  // ==================== Flag & Category ====================

  async toggleFlag(id: string, actor: EmailActor, flagged: boolean) {
    await this.assertCanModify(id, actor);
    return this.prisma.email.update({
      where: { id },
      data: { flagged },
    });
  }

  async updateCategory(id: string, actor: EmailActor, category: string) {
    const validCategories = ['inbox', 'sent', 'customer', 'advertisement', 'drafts', 'starred', 'trash', 'spam'];
    if (!validCategories.includes(category)) {
      throw new BadRequestException('Invalid category');
    }
    await this.assertCanModify(id, actor);

    return this.prisma.email.update({
      where: { id },
      data: { category },
    });
  }

  // ==================== Delete / Trash / Spam ====================

  /**
   * 严格"自己的邮箱"范围（超管也不例外）。清空回收站 / 扫描垃圾邮件
   * 这类批量动作只作用于调用者自己的账户，不能一键波及全公司。
   */
  private ownMailboxWhere(userId: string): Prisma.EmailWhereInput {
    return {
      OR: [
        { emailConfig: { userId } },
        { emailConfigId: null, senderId: userId },
      ],
    };
  }

  /**
   * Soft-delete: move an email to trash. It can be restored later.
   */
  async moveToTrash(id: string, actor: EmailActor) {
    await this.assertCanModify(id, actor);
    return this.prisma.email.update({
      where: { id },
      data: { category: 'trash' },
    });
  }

  /**
   * Batch soft-delete: move multiple emails to trash. 无权的 id 静默跳过。
   */
  async batchMoveToTrash(ids: string[], actor: EmailActor) {
    if (!Array.isArray(ids) || ids.length === 0) return { moved: 0 };
    const result = await this.prisma.email.updateMany({
      where: { AND: [{ id: { in: ids } }, this.mailboxWhere(actor)] },
      data: { category: 'trash' },
    });
    return { moved: result.count };
  }

  /**
   * Restore an email from trash back to its original category.
   */
  async restoreFromTrash(id: string, actor: EmailActor) {
    const email = await this.assertCanModify(id, actor);
    const newCat = email.direction === 'OUTBOUND' ? 'sent' : 'inbox';
    return this.prisma.email.update({
      where: { id },
      data: { category: newCat },
    });
  }

  /**
   * Permanently delete a single email.
   */
  async permanentDelete(id: string, actor: EmailActor) {
    await this.assertCanModify(id, actor);
    await this.prisma.email.delete({ where: { id } });
    return { deleted: 1 };
  }

  /**
   * Permanently delete all emails in the caller's own trash folder.
   */
  async emptyTrash(userId: string) {
    const result = await this.prisma.email.deleteMany({
      where: { AND: [{ category: 'trash' }, this.ownMailboxWhere(userId)] },
    });
    return { deleted: result.count };
  }

  // ── Spam filter（规则见 email-utils.ts 的 isSpam） ──────────

  /**
   * Scan all existing emails (inbox + customer + advertisement) and move
   * matches to the spam category. Returns the count of newly flagged.
   */
  async scanSpam(userId: string): Promise<{ flagged: number }> {
    const candidates = await this.prisma.email.findMany({
      where: {
        category: { in: ['inbox', 'customer', 'advertisement'] },
        direction: 'INBOUND',
        ...this.ownMailboxWhere(userId),
      },
      select: { id: true, subject: true, fromAddr: true, bodyText: true },
    });

    const spamIds: string[] = [];
    for (const email of candidates) {
      if (isSpam(email)) spamIds.push(email.id);
    }

    if (spamIds.length > 0) {
      await this.prisma.email.updateMany({
        where: { id: { in: spamIds } },
        data: { category: 'spam' },
      });
    }

    this.logger.log(`Spam scan complete: ${spamIds.length} emails flagged`);
    return { flagged: spamIds.length };
  }

  // ==================== Read Status ====================

  async getUnreadCount(userId: string, role: string) {
    const myConfigs = await this.prisma.emailConfig.findMany({
      where: { userId },
      select: { id: true },
    });
    const where: any = {
      direction: 'INBOUND',
      status: 'RECEIVED',
      emailConfigId: { in: myConfigs.map((c) => c.id) },
    };

    const count = await this.prisma.email.count({ where });
    return { count };
  }

  async markAllAsRead(userId: string, role: string) {
    const myConfigs = await this.prisma.emailConfig.findMany({
      where: { userId },
      select: { id: true },
    });
    const where: any = {
      direction: 'INBOUND',
      status: 'RECEIVED',
      emailConfigId: { in: myConfigs.map((c) => c.id) },
    };

    const result = await this.prisma.email.updateMany({
      where,
      data: { status: 'READ' },
    });

    return { updated: result.count };
  }

  async markAsRead(id: string, actor: EmailActor) {
    const email = await this.assertCanModify(id, actor);

    if (email.status === 'RECEIVED') {
      return this.prisma.email.update({
        where: { id },
        data: { status: 'READ' },
      });
    }

    return email;
  }

  // ==================== Per-account Signature ====================

  /** Load an account's signature (scoped to the caller). */
  async getAccountSignature(userId: string, configId: string) {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
      select: { id: true, emailAddr: true, fromName: true, signature: true },
    });
    if (!config) {
      throw new NotFoundException('Email account not found');
    }
    return { config };
  }

  /** Replace an account's signature (HTML allowed). */
  async updateAccountSignature(
    userId: string,
    configId: string,
    signature: string,
  ) {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
    });
    if (!config) {
      throw new NotFoundException('Email account not found');
    }
    const updated = await this.prisma.emailConfig.update({
      where: { id: configId },
      data: { signature: signature || null },
      select: { id: true, emailAddr: true, fromName: true, signature: true },
    });
    return { config: updated };
  }

  // ==================== Campaigns ====================

  async listCampaigns(userId: string, role: string) {
    const where = role === 'ADMIN' ? {} : { createdById: userId };
    const campaigns = await this.prisma.emailCampaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { emails: true } },
      },
    });
    return { campaigns };
  }

  async createCampaign(
    userId: string,
    dto: { name: string; description?: string },
  ) {
    return this.prisma.emailCampaign.create({
      data: {
        name: dto.name,
        description: dto.description || null,
        createdById: userId,
      },
    });
  }

  async updateCampaign(
    id: string,
    userId: string,
    role: string,
    dto: { name?: string; description?: string; status?: string },
  ) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (role !== 'ADMIN' && campaign.createdById !== userId) {
      throw new ForbiddenException('无权修改此活动');
    }
    const patch: any = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description || null;
    if (dto.status !== undefined) {
      patch.status = dto.status;
      if (dto.status === 'SENT' && !campaign.sentAt) patch.sentAt = new Date();
    }
    return this.prisma.emailCampaign.update({ where: { id }, data: patch });
  }

  async deleteCampaign(id: string, userId: string, role: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (role !== 'ADMIN' && campaign.createdById !== userId) {
      throw new ForbiddenException('无权删除此活动');
    }
    // FK on emails is ON DELETE SET NULL — emails are preserved.
    await this.prisma.emailCampaign.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Campaign aggregates.
   * - sent: number of emails tagged with this campaign
   * - delivered: of those, how many reached SENT status (SMTP OK)
   * - opened: at least one non-DUP open event
   * - openedByHuman: at least one HUMAN/PROXY open (stronger signal)
   * - clicked: at least one click event
   * - avgConfidence: mean of email.openConfidence
   */
  async getCampaignStats(campaignId: string, actor: EmailActor) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (!this.isAdmin(actor) && campaign.createdById !== actor.id) {
      throw new ForbiddenException('无权查看此活动');
    }

    const emails = await this.prisma.email.findMany({
      where: { campaignId },
      select: {
        id: true,
        status: true,
        viewCount: true,
        firstHumanOpenAt: true,
        totalClicks: true,
        openConfidence: true,
      },
    });

    const sent = emails.length;
    const delivered = emails.filter((e) => e.status === 'SENT' || e.status === 'VIEWED').length;
    const opened = emails.filter((e) => (e.viewCount ?? 0) > 0).length;
    const openedByHuman = emails.filter((e) => e.firstHumanOpenAt).length;
    const clicked = emails.filter((e) => (e.totalClicks ?? 0) > 0).length;
    const avgConfidence = sent > 0
      ? emails.reduce((s, e) => s + (e.openConfidence ?? 0), 0) / sent
      : 0;

    return {
      campaign,
      stats: {
        sent,
        delivered,
        opened,
        openedByHuman,
        clicked,
        openRate: sent > 0 ? opened / sent : 0,
        humanOpenRate: sent > 0 ? openedByHuman / sent : 0,
        clickRate: sent > 0 ? clicked / sent : 0,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
      },
    };
  }

  // ==================== Recipients ====================

  /** 非管理员只能看到自己发过信的收件人。 */
  private recipientScope(actor: EmailActor): Prisma.EmailRecipientWhereInput {
    if (this.isAdmin(actor)) return {};
    return { emails: { some: { senderId: actor.id } } };
  }

  async listRecipients(
    actor: EmailActor,
    q: { search?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, q.page || 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize || 50));
    const where: any = { ...this.recipientScope(actor) };
    if (q.search) {
      where.OR = [
        { emailAddr: { contains: q.search, mode: 'insensitive' } },
        { name: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.emailRecipient.findMany({
        where,
        orderBy: { lastSentAt: { sort: 'desc', nulls: 'last' } },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.emailRecipient.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * 收件人地址自动补全。并集来自：
   *   1) EmailRecipient（我们发过的所有地址，带累计统计）
   *   2) Email.fromAddr INBOUND（收到过的发件人，包含未建档的客户）
   *   3) Contact.email（CRM 联系人）
   * 按 lastActivity 倒序；上限默认 20 条。
   */
  async suggestAddresses(actor: EmailActor, query: string, limit = 20) {
    const q = (query || '').trim();
    if (!q) return [];
    const take = Math.min(50, Math.max(1, limit));
    const like = { contains: q, mode: 'insensitive' as const };

    // 地址联想只从"自己能看到的"数据里出：自己发过的收件人、自己邮箱
    // 收到过的发件人、自己客户的联系人（管理员看全部联系人，和联系人
    // 模块的规则一致）。
    const [recipients, inboundEmails, contacts] = await Promise.all([
      this.prisma.emailRecipient.findMany({
        where: {
          AND: [
            this.recipientScope(actor),
            { OR: [{ emailAddr: like }, { name: like }] },
          ],
        },
        orderBy: { lastSentAt: { sort: 'desc', nulls: 'last' } },
        take,
        select: { emailAddr: true, name: true, lastSentAt: true },
      }),
      this.prisma.email.findMany({
        where: {
          AND: [
            { direction: 'INBOUND' },
            this.ownMailboxWhere(actor.id),
            { OR: [{ fromAddr: like }, { fromName: like }] },
          ],
        },
        orderBy: { receivedAt: 'desc' },
        take: take * 3, // 多取一些，distinct 在应用层做
        select: { fromAddr: true, fromName: true, receivedAt: true },
      }),
      this.prisma.contact.findMany({
        where: {
          email: { not: null },
          OR: [{ email: like }, { name: like }],
          ...(this.isAdmin(actor) ? {} : { customer: { ownerId: actor.id } }),
        },
        take,
        select: { email: true, name: true },
      }),
    ]);

    // "Name <addr>" 拆分。兼容裸邮箱 / 带引号名 / 多种分隔。
    const parseAddr = (raw: string): { name: string | null; email: string | null } => {
      if (!raw) return { name: null, email: null };
      const m = raw.match(/^\s*(.*?)<([^>]+)>\s*$/);
      if (m) {
        const name = m[1].trim().replace(/^["']|["']$/g, '').trim() || null;
        return { name, email: m[2].trim().toLowerCase() };
      }
      return { name: null, email: raw.trim().toLowerCase() };
    };

    type Entry = { email: string; name: string | null; lastActivity: Date | null };
    const map = new Map<string, Entry>();
    const merge = (email: string | null, name: string | null, when: Date | null) => {
      if (!email || !email.includes('@')) return;
      const key = email.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { email: key, name, lastActivity: when });
        return;
      }
      // 保留更近的时间；姓名取现有优先，没有才填
      if (when && (!existing.lastActivity || when > existing.lastActivity)) {
        existing.lastActivity = when;
      }
      if (!existing.name && name) existing.name = name;
    };

    for (const r of recipients) {
      merge(r.emailAddr, r.name || null, r.lastSentAt);
    }
    for (const e of inboundEmails) {
      const parsed = parseAddr(e.fromAddr);
      merge(parsed.email, e.fromName || parsed.name, e.receivedAt);
    }
    for (const c of contacts) {
      merge(c.email || null, c.name || null, null);
    }

    return Array.from(map.values())
      .sort((a, b) => {
        const aT = a.lastActivity?.getTime() ?? 0;
        const bT = b.lastActivity?.getTime() ?? 0;
        return bT - aT;
      })
      .slice(0, take)
      .map((x) => ({
        email: x.email,
        name: x.name || null,
        lastActivity: x.lastActivity,
      }));
  }

  /**
   * 铃铛通知数据源：当前用户发出、被收件人真人打开、且打开时间晚于
   * `since` 的邮件。打开时间优先用 firstHumanOpenAt（已过反代预取 / 代理
   * 去噪），没有时退化到 viewedAt。
   *
   * 返回：
   *   items   – 最多 limit 条，按首次真人打开时间倒序
   *   total   – 未确认的总数（用于铃铛红点上的数字；>99 前端自己截）
   *   latestAt – 当前最新一次被打开的时间；前端"全部确认"时把它写回
   *              localStorage 作为新的 since
   */
  async listOpenNotifications(
    userId: string,
    since: Date | null,
    limit = 10,
  ): Promise<{
    items: Array<{
      id: string;
      subject: string;
      toAddr: string;
      firstOpenAt: Date | null;
      lastOpenedAt: Date | null;
      viewCount: number;
    }>;
    total: number;
    latestAt: Date | null;
  }> {
    const take = Math.min(50, Math.max(1, limit));
    // 用 (firstHumanOpenAt ?? viewedAt) 统一作为"打开时间"。Prisma 的
    // where 不支持 coalesce，所以拆成两个 OR 分支。
    const openTimeOr = (threshold: Date | null) => {
      const conds: any[] = [];
      if (threshold) {
        conds.push({ firstHumanOpenAt: { gt: threshold } });
        // firstHumanOpenAt 为空的行，用 viewedAt 兜底
        conds.push({ AND: [{ firstHumanOpenAt: null }, { viewedAt: { gt: threshold } }] });
      } else {
        conds.push({ firstHumanOpenAt: { not: null } });
        conds.push({ AND: [{ firstHumanOpenAt: null }, { viewedAt: { not: null } }] });
      }
      return conds;
    };

    const baseWhere = {
      senderId: userId,
      direction: 'OUTBOUND' as const,
      status: 'VIEWED' as const,
      OR: openTimeOr(since),
    };

    const [rows, total] = await Promise.all([
      this.prisma.email.findMany({
        where: baseWhere,
        orderBy: [
          { firstHumanOpenAt: { sort: 'desc', nulls: 'last' } },
          { viewedAt: { sort: 'desc', nulls: 'last' } },
        ],
        take,
        select: {
          id: true,
          subject: true,
          toAddr: true,
          firstHumanOpenAt: true,
          viewedAt: true,
          lastOpenedAt: true,
          viewCount: true,
        },
      }),
      this.prisma.email.count({ where: baseWhere }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      toAddr: r.toAddr,
      firstOpenAt: r.firstHumanOpenAt || r.viewedAt || null,
      lastOpenedAt: r.lastOpenedAt || r.viewedAt || null,
      viewCount: r.viewCount,
    }));

    const latestAt = items.reduce<Date | null>((acc, it) => {
      const t = it.firstOpenAt || it.lastOpenedAt;
      if (!t) return acc;
      if (!acc || t > acc) return t;
      return acc;
    }, null);

    return { items, total, latestAt };
  }

  async getRecipientDetail(id: string, actor: EmailActor) {
    const recipient = await this.prisma.emailRecipient.findFirst({
      where: { AND: [{ id }, this.recipientScope(actor)] },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    const emails = await this.prisma.email.findMany({
      where: {
        recipientId: id,
        ...(this.isAdmin(actor) ? {} : { senderId: actor.id }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        subject: true,
        sentAt: true,
        status: true,
        openConfidence: true,
        firstHumanOpenAt: true,
        totalClicks: true,
        viewCount: true,
        campaignId: true,
      },
    });
    return { recipient, emails };
  }

  async recordView(emailId: string) {
    try {
      const email = await this.prisma.email.findUnique({
        where: { id: emailId },
      });

      if (!email || email.direction !== 'OUTBOUND') return;

      const isFirstView = !email.viewedAt;

      await this.prisma.email.update({
        where: { id: emailId },
        data: {
          viewedAt: email.viewedAt || new Date(),
          viewCount: { increment: 1 },
          status: 'VIEWED',
        },
      });

      this.logger.log(
        `Email ${emailId} viewed (${isFirstView ? 'first time' : `view #${email.viewCount + 1}`})`,
      );
    } catch (error) {
      this.logger.error(`Failed to record email view: ${error.message}`);
    }
  }

  async getRecentlyViewed(userId: string, role: string) {
    const where: any = {
      direction: 'OUTBOUND',
      status: 'VIEWED',
      viewedAt: { not: null },
    };

    if (role !== 'ADMIN') {
      where.senderId = userId;
    }

    const since = new Date();
    since.setHours(since.getHours() - 24);
    where.viewedAt = { gte: since };

    const items = await this.prisma.email.findMany({
      where,
      include: {
        customer: { select: { id: true, companyName: true } },
      },
      orderBy: { viewedAt: 'desc' },
      take: 20,
    });

    return { items };
  }

  // ==================== Fetch Emails ====================
  // 实际同步逻辑在 ImapSyncService（按 UID 增量拉取）。这里只做权限
  // 校验，手动"收取"和后台定时任务撞上时共用同一次同步。

  async fetchEmails(userId: string, configId: string) {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
      select: { id: true },
    });
    if (!config) {
      throw new BadRequestException(
        'Email configuration not found. Please configure your IMAP settings first.',
      );
    }
    try {
      return await this.imapSync.syncAccount(configId);
    } catch (error: any) {
      throw new BadRequestException(`收取失败：${error?.message || error}`);
    }
  }

  async fetchAllAccounts(userId: string) {
    const configs = await this.prisma.emailConfig.findMany({
      where: { userId },
      select: { id: true, emailAddr: true },
    });
    if (configs.length === 0) {
      throw new BadRequestException('No email configurations found');
    }

    // 各账户并行收取，互不影响
    const accounts = await Promise.all(
      configs.map(async (config) => {
        try {
          const result = await this.imapSync.syncAccount(config.id);
          return { emailAddr: config.emailAddr, ...result };
        } catch (error: any) {
          return { emailAddr: config.emailAddr, error: error?.message || String(error) };
        }
      }),
    );
    const totalFetched = accounts.reduce((n, a: any) => n + (a.fetched || 0), 0);
    return { totalFetched, accounts };
  }

  /**
   * 把 SMTP 已发送的邮件以 RFC822 原文追加到服务器的 Sent 文件夹。
   * 用 nodemailer 的 MailComposer 复用完全相同的 mailOptions，保证原文
   * 与 SMTP 发出去的那封一致（含同一个 Message-Id / 附件 / 签名）。
   */
  private async appendToImapSent(
    config: {
      imapHost: string;
      imapPort: number;
      imapSecure: boolean;
      imapUser: string;
      imapPass: string;
    },
    mailOptions: any,
  ): Promise<void> {
    if (!config.imapHost || !config.imapUser || !config.imapPass) {
      return;
    }

    const rawBuffer: Buffer = await new Promise((resolve, reject) => {
      new MailComposer(mailOptions).compile().build((err: any, msg: Buffer) => {
        if (err) reject(err);
        else resolve(msg);
      });
    });

    const imap = createImap(config);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        try {
          imap.end();
        } catch {
          /* noop */
        }
        err ? reject(err) : resolve();
      };

      imap.once('ready', async () => {
        try {
          const sentFolder = await findSentFolder(imap, this.logger);
          if (!sentFolder) {
            this.logger.warn(
              'No Sent folder on IMAP server; skipping APPEND of outgoing message',
            );
            return done();
          }
          // node-imap append: 已发出的邮件按约定标记为 \Seen。
          imap.append(
            rawBuffer,
            { mailbox: sentFolder, flags: ['\\Seen'], date: new Date() },
            (err: Error | null) => (err ? done(err) : done()),
          );
        } catch (err: any) {
          done(err);
        }
      });

      imap.once('error', (err: Error) => done(err));
      imap.connect();
    });
  }

  // ==================== Template CRUD ====================

  async findAllTemplates() {
    // 模板是公司共享资源，大家都能看、都能用。
    return this.prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(dto: CreateTemplateDto, actor: EmailActor) {
    return this.prisma.emailTemplate.create({
      data: {
        name: dto.name,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        category: dto.category,
        createdById: actor.id,
      },
    });
  }

  /** 改 / 删模板：创建人或管理员；历史模板没有创建人，仅管理员。 */
  private async assertCanEditTemplate(id: string, actor: EmailActor) {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id },
    });
    if (!template) {
      throw new NotFoundException('Email template not found');
    }
    if (!this.isAdmin(actor) && template.createdById !== actor.id) {
      throw new ForbiddenException('只有模板创建人或管理员可以修改该模板');
    }
  }

  async updateTemplate(
    id: string,
    dto: Partial<CreateTemplateDto>,
    actor: EmailActor,
  ) {
    await this.assertCanEditTemplate(id, actor);
    return this.prisma.emailTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        category: dto.category,
      },
    });
  }

  async deleteTemplate(id: string, actor: EmailActor) {
    await this.assertCanEditTemplate(id, actor);
    return this.prisma.emailTemplate.delete({ where: { id } });
  }

  // ==================== 邮件时间轴时间戳修正 ====================
  // （后台收信调度见 ImapSyncService.scheduleSync）

  private reconcilingEmailActivityTimestamps = false;

  /**
   * 把 EMAIL 类型活动的 createdAt 对齐到对应邮件的实际收发时间。
   *
   * 修复老数据里因为同步时使用了 now() 而产生的时间轴错乱。每小时自动跑一次；
   * 也可以通过 POST /emails/reconcile-activity-timestamps 手动触发。
   */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcileEmailActivityTimestamps(): Promise<{ updated: number }> {
    if (this.reconcilingEmailActivityTimestamps) {
      this.logger.warn(
        'Skipping email activity timestamp reconciliation: previous run still in progress',
      );
      return { updated: 0 };
    }

    this.reconcilingEmailActivityTimestamps = true;
    try {
      // 单条 SQL 搞定：把 activities.created_at 对齐到 emails 的实际时间，
      // 只更新确实不一致的行，避免每小时都无意义地写整表。
      const updated: number = await this.prisma.$executeRawUnsafe(
        `UPDATE activities a
         SET created_at = COALESCE(e.sent_at, e.received_at, e.created_at)
         FROM emails e
         WHERE a.type = 'EMAIL'
           AND a.related_type = 'email'
           AND a.related_id = e.id
           AND a.created_at IS DISTINCT FROM COALESCE(e.sent_at, e.received_at, e.created_at)`,
      );

      if (updated > 0) {
        this.logger.log(
          `Reconciled ${updated} email activity timestamp(s) to match email sent/received time`,
        );
      }

      return { updated };
    } catch (err: any) {
      this.logger.error(
        `Failed to reconcile email activity timestamps: ${err?.message}`,
        err?.stack,
      );
      return { updated: 0 };
    } finally {
      this.reconcilingEmailActivityTimestamps = false;
    }
  }

  // ==================== Attachment Lazy Download ====================

  /**
   * 返回附件可读路径（磁盘绝对路径 + 元数据），用于 controller 做 sendFile。
   *
   * 策略：
   *   1. 若 storagePath 已存在且文件仍在 → 直接返回；
   *   2. 否则按 EmailAttachment 记的 imapUid/imapFolder 回源 IMAP，
   *      重新解析这封邮件，按 filename+mime+size 找到对应附件，落盘缓存；
   *   3. UID 缺失（历史邮件）或上游不可用 → 抛错，前端提示用户。
   */
  async downloadAttachment(attachmentId: string, actor: EmailActor) {
    const att = await this.prisma.emailAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        email: {
          include: {
            emailConfig: true,
          },
        },
      },
    });
    if (!att) {
      throw new NotFoundException('附件不存在');
    }
    await this.assertCanRead(att.emailId, actor);

    // 1) 已缓存 → 直接用
    if (att.storagePath && fs.existsSync(att.storagePath)) {
      return {
        filePath: att.storagePath,
        fileName: att.fileName,
        mimeType: att.mimeType,
      };
    }

    // 2) 需要从 IMAP 回源
    if (att.imapUid == null || !att.imapFolder) {
      throw new BadRequestException(
        '附件缺少 IMAP 定位信息，无法回源下载（可能是旧版本收取的邮件）',
      );
    }
    const config = att.email.emailConfig;
    if (!config) {
      throw new BadRequestException('邮件对应的邮箱账号已删除，无法回源下载');
    }

    const buffer = await this.fetchAttachmentFromImap(
      config,
      att.imapFolder,
      att.imapUid,
      att.fileName,
      att.mimeType,
      att.size,
      att.contentId,
    );

    // 落盘缓存。命名格式：{uuid}_{safeFileName}，以避免同名覆盖。
    const uploadDir = path.join(process.cwd(), 'uploads', 'email-attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const safeName = att.fileName.replace(/[/\\?%*:|"<>]/g, '_');
    const filePath = path.join(uploadDir, `${uuidv4()}_${safeName}`);
    await fs.promises.writeFile(filePath, buffer);

    await this.prisma.emailAttachment.update({
      where: { id: att.id },
      data: { storagePath: filePath, downloadedAt: new Date() },
    });

    return { filePath, fileName: att.fileName, mimeType: att.mimeType };
  }

  private fetchAttachmentFromImap(
    config: {
      imapHost: string;
      imapPort: number;
      imapUser: string;
      imapPass: string;
      imapSecure: boolean;
    },
    folder: string,
    uid: number,
    wantedName: string,
    wantedMime: string,
    wantedSize: number,
    wantedCid: string | null,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const imap = createImap(config);

      let settled = false;
      const finish = (err: any, buf?: Buffer) => {
        if (settled) return;
        settled = true;
        try {
          imap.end();
        } catch {
          /* ignore */
        }
        if (err) reject(err);
        else resolve(buf!);
      };

      imap.once('error', (err: any) => finish(err));
      imap.once('ready', () => {
        imap.openBox(folder, true, (boxErr: any) => {
          if (boxErr) return finish(boxErr);
          const f = imap.fetch(uid, { bodies: '', struct: true });
          f.on('message', (msg: any) => {
            msg.on('body', (stream: any) => {
              simpleParser(stream)
                .then((parsed) => {
                  const list = parsed.attachments || [];
                  // 优先按 cid 匹配，其次 (filename + mime)，最后退化到 filename
                  const match =
                    (wantedCid &&
                      list.find((x: any) => x.cid === wantedCid)) ||
                    list.find(
                      (x: any) =>
                        x.filename === wantedName &&
                        (x.contentType || '').toLowerCase() ===
                          wantedMime.toLowerCase(),
                    ) ||
                    list.find((x: any) => x.filename === wantedName);
                  if (!match) {
                    return finish(new Error('附件在服务器上已不存在'));
                  }
                  const buf = match.content as Buffer;
                  if (!buf || !buf.length) {
                    return finish(new Error('附件内容为空'));
                  }
                  // 日志记录一下 size 偏差，但不阻塞
                  if (wantedSize && Math.abs(buf.length - wantedSize) > 1024) {
                    this.logger.warn(
                      `Attachment size mismatch for ${wantedName}: metadata ${wantedSize}, actual ${buf.length}`,
                    );
                  }
                  finish(null, buf);
                })
                .catch((e) => finish(e));
            });
          });
          f.once('error', (err: any) => finish(err));
        });
      });

      imap.connect();
    });
  }
}
