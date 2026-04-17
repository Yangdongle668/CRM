import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import * as Imap from 'imap';
import * as fs from 'fs';
import { simpleParser } from 'mailparser';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { SendEmailDto } from './dto/send-email.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import {
  QUEUE_EMAIL,
  EMAIL_JOB_SEND,
} from '../../queue/queue.constants';
import { EmailTrackingService } from './email-tracking.service';

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: EmailTrackingService,
    @Optional()
    @InjectQueue(QUEUE_EMAIL)
    private readonly emailQueue?: Queue,
  ) {}

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

  /**
   * Try to locate an existing thread by looking up emails whose
   * messageId matches the In-Reply-To or References headers from the
   * incoming email. Returns null if no match is found.
   */
  private async findThreadByReplyHeaders(
    inReplyTo?: string | null,
    references?: string | string[] | null,
  ): Promise<string | null> {
    const ids: string[] = [];
    if (inReplyTo) ids.push(inReplyTo);
    if (references) {
      const refs = Array.isArray(references) ? references : [references];
      for (const r of refs) {
        if (r && !ids.includes(r)) ids.push(r);
      }
    }
    if (ids.length === 0) return null;

    const parent = await this.prisma.email.findFirst({
      where: { messageId: { in: ids } },
      select: { threadId: true },
      orderBy: { createdAt: 'desc' },
    });
    return parent?.threadId || null;
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
      },
      orderBy: { createdAt: 'asc' },
    });
    return { accounts };
  }

  async createEmailAccount(userId: string, data: any) {
    const { emailAddr, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, imapHost, imapPort, imapUser, imapPass, imapSecure, fromName, signature } = data;

    if (!emailAddr || !smtpHost || !smtpUser || !imapHost || !imapUser) {
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
        imapUser,
        imapPass,
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
        imapUser: data.imapUser || config.imapUser,
        imapPass: data.imapPass && data.imapPass !== '********' ? data.imapPass : config.imapPass,
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
      const originalEmail = await this.prisma.email.findUnique({
        where: { id: dto.inReplyTo },
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
      const matched = await this.autoMatchCustomer(dto.toAddr);
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
        toAddr: dto.toAddr,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        bodyHtml: htmlBody,
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

    const mailOptions: any = {
      from: fromAddress,
      to: emailRecord.toAddr,
      cc: emailRecord.cc || undefined,
      bcc: emailRecord.bcc || undefined,
      subject: emailRecord.subject,
      html: htmlWithTracking,
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
    },
  ) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    // When viewing a specific customer's emails, show all accounts' emails for that customer.
    // Otherwise restrict non-admins to their own emails only.
    if (role !== 'ADMIN' && !query.customerId) {
      where.senderId = userId;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.direction) {
      where.direction = query.direction;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.emailConfigId) {
      where.emailConfigId = query.emailConfigId;
    }

    if (query.category) {
      where.category = query.category;
    }

    if (query.flagged === 'true') {
      where.flagged = true;
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
        include: {
          customer: { select: { id: true, companyName: true } },
          sender: { select: { id: true, name: true, email: true } },
          emailConfig: { select: { emailAddr: true } },
        },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.email.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  // ==================== Email Detail ====================

  async findOne(id: string, _userId: string, _role: string) {
    const where: any = { id };

    const email = await this.prisma.email.findFirst({
      where,
      include: {
        customer: true,
        sender: { select: { id: true, name: true, email: true } },
        emailConfig: { select: { emailAddr: true } },
        thread: {
          include: {
            emails: {
              orderBy: [
                { receivedAt: { sort: 'asc', nulls: 'last' } },
                { sentAt: { sort: 'asc', nulls: 'last' } },
                { createdAt: 'asc' },
              ],
              include: {
                sender: { select: { id: true, name: true, email: true } },
                customer: { select: { id: true, companyName: true } },
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
      conditions.push(`e.email_config_id = $${paramIdx++}`);
      params.push(where.emailConfigId);
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
    if (where.emailConfigId) latestEmailsWhere.emailConfigId = where.emailConfigId;

    const latestEmails = await this.prisma.email.findMany({
      where: latestEmailsWhere,
      include: {
        customer: { select: { id: true, companyName: true } },
        sender: { select: { id: true, name: true, email: true } },
        emailConfig: { select: { emailAddr: true } },
      },
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

      return {
        threadId: row.group_id === latestEmail?.id ? null : row.group_id,
        threadSubject: latestEmail?.subject || '(No Subject)',
        emailCount: row.email_count,
        latestEmail,
      };
    });

    return { items: results, total, page, pageSize };
  }

  async findThreadEmails(threadId: string, _userId: string, _role: string) {
    const where: any = { threadId };

    const emails = await this.prisma.email.findMany({
      where,
      include: {
        customer: { select: { id: true, companyName: true } },
        sender: { select: { id: true, name: true, email: true } },
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

  async toggleFlag(id: string, userId: string, flagged: boolean) {
    const email = await this.prisma.email.findUnique({ where: { id } });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    return this.prisma.email.update({
      where: { id },
      data: { flagged },
    });
  }

  async updateCategory(id: string, userId: string, category: string) {
    const email = await this.prisma.email.findUnique({ where: { id } });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    const validCategories = ['inbox', 'sent', 'customer', 'advertisement', 'drafts', 'starred', 'trash', 'spam'];
    if (!validCategories.includes(category)) {
      throw new BadRequestException('Invalid category');
    }

    return this.prisma.email.update({
      where: { id },
      data: { category },
    });
  }

  // ==================== Read Status ====================

  async getUnreadCount(userId: string, role: string) {
    const where: any = {
      direction: 'INBOUND',
      status: 'RECEIVED',
    };

    if (role !== 'ADMIN') {
      where.senderId = userId;
    }

    const count = await this.prisma.email.count({ where });
    return { count };
  }

  async markAllAsRead(userId: string, role: string) {
    const where: any = {
      direction: 'INBOUND',
      status: 'RECEIVED',
    };

    if (role !== 'ADMIN') {
      where.senderId = userId;
    }

    const result = await this.prisma.email.updateMany({
      where,
      data: { status: 'READ' },
    });

    return { updated: result.count };
  }

  async markAsRead(id: string, userId: string, role: string) {
    const where: any = { id };
    if (role !== 'ADMIN') {
      where.senderId = userId;
    }

    const email = await this.prisma.email.findFirst({ where });
    if (!email) {
      throw new NotFoundException('Email not found');
    }

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
      throw new BadRequestException('无权修改此活动');
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
      throw new BadRequestException('无权删除此活动');
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
  async getCampaignStats(campaignId: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

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

  async listRecipients(
    q: { search?: string; page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, q.page || 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize || 50));
    const where: any = {};
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

  async getRecipientDetail(id: string) {
    const recipient = await this.prisma.emailRecipient.findUnique({
      where: { id },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');
    const emails = await this.prisma.email.findMany({
      where: { recipientId: id },
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

  async fetchEmails(userId: string, configId: string): Promise<{ fetched: number; inboxFetched?: number; sentFetched?: number; sentFolder?: string | null }> {
    const config = await this.prisma.emailConfig.findFirst({
      where: { id: configId, userId },
    });

    if (!config) {
      throw new BadRequestException(
        'Email configuration not found. Please configure your IMAP settings first.',
      );
    }

    const imap = new Imap({
      user: config.imapUser,
      password: config.imapPass,
      host: config.imapHost,
      port: config.imapPort,
      tls: config.imapSecure,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 30000,
      connTimeout: 30000,
    });

    return new Promise((resolve, reject) => {
      let totalFetched = 0;

      imap.once('ready', async () => {
        try {
          const inboxCount = await this.fetchFromFolder(
            imap,
            userId,
            configId,
            config.emailAddr,
            'INBOX',
            'INBOUND',
          );
          totalFetched += inboxCount;

          let sentCount = 0;
          const sentFolder = await this.findSentFolder(imap);
          if (sentFolder) {
            this.logger.log(`Found sent folder: ${sentFolder}`);
            sentCount = await this.fetchFromFolder(
              imap,
              userId,
              configId,
              config.emailAddr,
              sentFolder,
              'OUTBOUND',
            );
            totalFetched += sentCount;
          } else {
            this.logger.warn('No sent folder found on IMAP server');
          }

          imap.end();
          resolve({
            fetched: totalFetched,
            inboxFetched: inboxCount,
            sentFetched: sentCount,
            sentFolder: sentFolder || null,
          });
        } catch (error) {
          imap.end();
          reject(
            error instanceof BadRequestException
              ? error
              : new BadRequestException(`Fetch failed: ${error.message}`),
          );
        }
      });

      imap.once('error', (imapErr: Error) => {
        reject(
          new BadRequestException(
            `IMAP connection failed: ${imapErr.message}`,
          ),
        );
      });

      imap.connect();
    });
  }

  async fetchAllAccounts(userId: string) {
    const configs = await this.prisma.emailConfig.findMany({
      where: { userId },
    });

    if (configs.length === 0) {
      throw new BadRequestException('No email configurations found');
    }

    const results: any = {
      totalFetched: 0,
      accounts: [],
    };

    for (const config of configs) {
      try {
        const result = await this.fetchEmails(userId, config.id);
        results.accounts.push({
          emailAddr: config.emailAddr,
          ...result,
        });
        results.totalFetched += result.fetched;
      } catch (error) {
        this.logger.error(`Failed to fetch emails for ${config.emailAddr}: ${error.message}`);
        results.accounts.push({
          emailAddr: config.emailAddr,
          error: error.message,
        });
      }
    }

    return results;
  }

  private fetchFromFolder(
    imap: any,
    userId: string,
    configId: string,
    userEmail: string,
    folderName: string,
    direction: 'INBOUND' | 'OUTBOUND',
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      imap.openBox(folderName, true, (err: any) => {
        if (err) {
          this.logger.warn(`Failed to open folder ${folderName}: ${err.message}`);
          return resolve(0);
        }

        imap.search(['ALL'], (searchErr: any, results: number[]) => {
          if (searchErr) {
            this.logger.warn(`Search failed in ${folderName}: ${searchErr.message}`);
            return resolve(0);
          }

          if (!results || results.length === 0) {
            return resolve(0);
          }

          const toFetch = results;
          const fetch = imap.fetch(toFetch, {
            bodies: '',
            struct: true,
          });

          let fetchedCount = 0;
          const emailPromises: Promise<void>[] = [];

          fetch.on('message', (msg: any) => {
            msg.on('body', (stream: any) => {
              const promise = simpleParser(stream).then(async (parsed) => {
                const messageId = parsed.messageId || null;

                if (messageId) {
                  const existing = await this.prisma.email.findUnique({
                    where: { messageId },
                  });
                  if (existing) return;
                }

                const fromAddr = parsed.from?.value?.[0]?.address || 'unknown';
                const toAddr = parsed.to?.value?.map((v) => v.address).join(', ') || '';
                const ccAddr = parsed.cc?.value?.map((v) => v.address).join(', ') || null;

                const matchEmail = direction === 'INBOUND' ? fromAddr : toAddr.split(',')[0]?.trim();
                const customer = matchEmail ? await this.autoMatchCustomer(matchEmail) : null;

                const fromName = parsed.from?.value?.[0]?.name || '';

                const status = direction === 'INBOUND' ? 'RECEIVED' : 'SENT';
                let category = 'inbox';
                if (customer) {
                  category = 'customer';
                } else if (direction === 'OUTBOUND') {
                  category = 'sent';
                }

                const rawSubject = parsed.subject || '(No Subject)';

                // Thread by reply chain (In-Reply-To / References), not
                // by subject. Only emails that are genuine replies to one
                // another share a thread.
                let threadId: string | null = await this.findThreadByReplyHeaders(
                  parsed.inReplyTo as string | undefined,
                  parsed.references as string | string[] | undefined,
                );
                if (!threadId) {
                  threadId = await this.createThread(rawSubject);
                }

                const newEmail = await this.prisma.email.create({
                  data: {
                    messageId,
                    fromAddr,
                    toAddr,
                    cc: ccAddr,
                    subject: rawSubject,
                    bodyHtml: parsed.html || null,
                    bodyText: parsed.text || null,
                    direction,
                    status,
                    category,
                    sentAt: direction === 'OUTBOUND' ? (parsed.date || new Date()) : null,
                    receivedAt: direction === 'INBOUND' ? (parsed.date || new Date()) : null,
                    customerId: customer?.id || null,
                    senderId: userId,
                    emailConfigId: configId,
                    threadId,
                  },
                });

                if (customer) {
                  const senderLabel = fromName ? `${fromName} (${fromAddr})` : fromAddr;
                  const actContent = direction === 'INBOUND'
                    ? `收到邮件 - 发件人: ${senderLabel}，主题: ${parsed.subject || '(无主题)'}`
                    : `发送邮件 - 收件人: ${toAddr}，主题: ${parsed.subject || '(无主题)'}`;

                  // 使用邮件的实际收发时间作为活动时间，避免同步时所有历史邮件都被标成
                  // 当前时刻，导致时间轴顺序错乱。
                  const activityTime = parsed.date || new Date();

                  await this.prisma.activity.create({
                    data: {
                      type: 'EMAIL',
                      content: actContent,
                      customerId: customer.id,
                      ownerId: userId,
                      relatedType: 'email',
                      relatedId: newEmail.id,
                      createdAt: activityTime,
                    },
                  }).catch(() => {});
                }

                fetchedCount++;
              });

              emailPromises.push(promise);
            });
          });

          fetch.once('end', () => {
            Promise.all(emailPromises)
              .then(() => {
                this.logger.log(`Fetched ${fetchedCount} emails from ${folderName}`);
                resolve(fetchedCount);
              })
              .catch((promiseErr) => {
                this.logger.error(`Error processing emails from ${folderName}: ${promiseErr.message}`);
                resolve(fetchedCount);
              });
          });

          fetch.once('error', (fetchErr: any) => {
            this.logger.warn(`Fetch error in ${folderName}: ${fetchErr.message}`);
            resolve(0);
          });
        });
      });
    });
  }

  private findSentFolder(imap: any): Promise<string | null> {
    return new Promise((resolve) => {
      imap.getBoxes((err: any, boxes: any) => {
        if (err) {
          this.logger.warn(`Failed to list IMAP boxes: ${err.message}`);
          return resolve(null);
        }

        const sentNames = [
          'Sent', 'SENT', 'sent', 'Sent Items', 'Sent Messages', 'Sent Mail',
          'INBOX.Sent', 'INBOX.Sent Messages', 'INBOX.Sent Items', 'INBOX.Sent Mail',
          '已发送', '已发邮件', '已发送邮件', 'INBOX.已发送', 'INBOX.已发邮件',
          '&XfJT0ZAB-', 'INBOX.&XfJT0ZAB-', '&XfJSIJZk;',
          'Sent Items', 'SentItems',
          'Gesendete Objekte', 'Gesendet', 'Messages envoyés', 'Envoyés', 'Enviados', 'Mensajes enviados',
        ];

        const flattenBoxes = (boxTree: any, prefix = ''): Array<{ path: string; attribs: string[] }> => {
          const result: Array<{ path: string; attribs: string[] }> = [];
          for (const [name, box] of Object.entries(boxTree)) {
            const delimiter = (box as any).delimiter || '/';
            const path = prefix ? `${prefix}${delimiter}${name}` : name;
            const attribs = (box as any).attribs || [];
            result.push({ path, attribs });
            if ((box as any).children) {
              result.push(...flattenBoxes((box as any).children, path));
            }
          }
          return result;
        };

        const allFolders = flattenBoxes(boxes);

        for (let i = 0; i < allFolders.length; i++) {
          const folder = allFolders[i];
          if (folder.attribs.includes('\\Sent') || folder.attribs.includes('\\sent')) {
            return resolve(folder.path);
          }
        }

        for (const name of sentNames) {
          if (boxes[name]) {
            return resolve(name);
          }
        }

        const gmailKey = Object.keys(boxes).find((k) => k === '[Gmail]' || k === '[Google Mail]') || null;
        if (gmailKey && (boxes[gmailKey] as any).children) {
          const children = (boxes[gmailKey] as any).children;
          const gmailDelim = (boxes[gmailKey] as any).delimiter || '/';
          const gmailSentNames = ['Sent Mail', '已发送邮件', 'Sent', 'Sent Messages'];
          for (const name of gmailSentNames) {
            if (children[name]) {
              return resolve(`${gmailKey}${gmailDelim}${name}`);
            }
          }
        }

        if (boxes['INBOX'] && (boxes['INBOX'] as any).children) {
          const inboxChildren = (boxes['INBOX'] as any).children;
          const inboxDelim = (boxes['INBOX'] as any).delimiter || '/';
          const inboxSentNames = ['Sent', 'Sent Messages', 'Sent Items', 'Sent Mail', '已发送', '已发邮件'];
          for (const name of inboxSentNames) {
            if (inboxChildren[name]) {
              return resolve(`INBOX${inboxDelim}${name}`);
            }
          }
        }

        const skipPatterns = /^(INBOX|Drafts|Trash|Junk|Spam|Archive|Deleted|Deleted Items|Deleted Messages|Notes|Outbox)$/i;
        for (let i = 0; i < allFolders.length; i++) {
          const folder = allFolders[i];
          const baseName = folder.path.split('/').pop() || '';
          if (skipPatterns.test(baseName)) continue;
          if (/sent/i.test(baseName) || /已发/.test(baseName) || /envoy/i.test(baseName) || /enviados/i.test(baseName) || /gesendet/i.test(baseName)) {
            return resolve(folder.path);
          }
        }

        const folderPaths = allFolders.map(f => `${f.path} [${f.attribs.join(',')}]`);
        this.logger.warn(`Could not find Sent folder. Available folders: ${folderPaths.join('; ')}`);
        resolve(null);
      });
    });
  }

  private async autoMatchCustomer(emailAddress: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { email: emailAddress },
      include: { customer: true },
    });

    if (contact) {
      return contact.customer;
    }

    const domain = emailAddress.split('@')[1]?.toLowerCase();
    if (domain && domain !== 'gmail.com' && domain !== 'yahoo.com' &&
        domain !== 'hotmail.com' && domain !== 'outlook.com' &&
        domain !== 'qq.com' && domain !== '163.com' && domain !== '126.com' &&
        domain !== 'foxmail.com' && domain !== 'icloud.com' &&
        domain !== 'live.com' && domain !== 'msn.com' &&
        domain !== 'aol.com' && domain !== 'mail.com' &&
        domain !== 'protonmail.com' && domain !== 'zoho.com') {
      const customers = await this.prisma.customer.findMany({
        where: { OR: [{ website: { not: null } }, { website2: { not: null } }] },
        select: { id: true, website: true, website2: true, companyName: true },
      });

      const extractDomain = (url: string) =>
        url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase();

      for (const c of customers) {
        for (const w of [c.website, c.website2]) {
          if (!w) continue;
          const websiteDomain = extractDomain(w);
          if (websiteDomain === domain || domain.endsWith('.' + websiteDomain)) {
            return c;
          }
        }
      }
    }

    return null;
  }

  // ==================== Template CRUD ====================

  async findAllTemplates() {
    return this.prisma.emailTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTemplate(dto: CreateTemplateDto) {
    return this.prisma.emailTemplate.create({
      data: {
        name: dto.name,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
        category: dto.category,
      },
    });
  }

  async updateTemplate(id: string, dto: Partial<CreateTemplateDto>) {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return this.prisma.emailTemplate.update({
      where: { id },
      data: dto,
    });
  }

  async deleteTemplate(id: string) {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Email template not found');
    }

    return this.prisma.emailTemplate.delete({ where: { id } });
  }

  // ==================== 邮件时间轴时间戳修正 ====================

  // 防止多个执行重叠（例如手动触发时 cron 正好也触发）。
  // ==================== Background IMAP Polling ====================
  private isFetchingAll = false;

  /**
   * Automatically fetch new emails for ALL configured IMAP accounts
   * every 60 seconds. A lock prevents overlapping runs — if the
   * previous fetch is still in progress, the tick is silently skipped.
   */
  @Cron('*/1 * * * *')
  async backgroundFetchAll(): Promise<void> {
    if (this.isFetchingAll) return;
    this.isFetchingAll = true;
    try {
      const configs = await this.prisma.emailConfig.findMany({
        select: { id: true, userId: true, emailAddr: true },
      });

      for (const cfg of configs) {
        try {
          const result = await this.fetchEmails(cfg.userId, cfg.id);
          if (result.fetched > 0) {
            this.logger.log(
              `[Auto] Fetched ${result.fetched} new email(s) for ${cfg.emailAddr}`,
            );
          }
        } catch (err: any) {
          this.logger.warn(
            `[Auto] Failed to fetch ${cfg.emailAddr}: ${err.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(`[Auto] backgroundFetchAll error: ${err.message}`);
    } finally {
      this.isFetchingAll = false;
    }
  }

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
}
