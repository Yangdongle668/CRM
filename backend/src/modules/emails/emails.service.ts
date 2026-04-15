import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as Imap from 'imap';
import { simpleParser } from 'mailparser';
import { PrismaService } from '../../prisma/prisma.service';
import { SendEmailDto } from './dto/send-email.dto';
import { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  private async findOrCreateThread(subject: string): Promise<string> {
    const normalized = this.normalizeSubject(subject);
    const existing = await this.prisma.emailThread.findFirst({
      where: { subject: normalized },
    });
    if (existing) return existing.id;

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

    await this.prisma.emailConfig.delete({
      where: { id: configId },
    });

    return { deleted: true };
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

    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    const fromAddress = config.fromName
      ? `"${config.fromName}" <${config.emailAddr}>`
      : config.emailAddr;

    let htmlBody = dto.bodyHtml;
    if (config.signature) {
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
      threadId = await this.findOrCreateThread(dto.subject);
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
      },
    });

    const appUrl = process.env.APP_URL || process.env.PUBLIC_URL || requestOrigin || '';
    const trackingPixel = appUrl
      ? `<img src="${appUrl}/api/emails/track/${emailRecord.id}/pixel.png" width="1" height="1" style="display:none;border:0;" alt="" />`
      : '';
    const htmlWithTracking = htmlBody + trackingPixel;

    try {
      const mailOptions: any = {
        from: fromAddress,
        to: dto.toAddr,
        cc: dto.cc || undefined,
        bcc: dto.bcc || undefined,
        subject: dto.subject,
        html: htmlWithTracking,
      };

      if (inReplyToMessageId) {
        mailOptions.inReplyTo = inReplyToMessageId;
        mailOptions.references = [inReplyToMessageId];
      }

      const info = await transporter.sendMail(mailOptions);

      const email = await this.prisma.email.update({
        where: { id: emailRecord.id },
        data: {
          messageId: info.messageId,
          status: 'SENT',
          sentAt: new Date(),
        },
        include: {
          customer: true,
        },
      });

      if (email.customerId) {
        await this.prisma.activity.create({
          data: {
            type: 'EMAIL',
            content: `发送邮件 - 收件人: ${dto.toAddr}，主题: ${dto.subject}`,
            customerId: email.customerId,
            ownerId: userId,
          },
        }).catch(() => {});
      }

      return email;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);

      await this.prisma.email.update({
        where: { id: emailRecord.id },
        data: { status: 'FAILED' },
      });

      throw new BadRequestException(`Failed to send email: ${error.message}`);
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

    if (role !== 'ADMIN') {
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
          const threadCache = new Map<string, string>();

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
                const normalizedSubject = this.normalizeSubject(rawSubject);
                let threadId: string | null = threadCache.get(normalizedSubject) || null;
                if (!threadId) {
                  threadId = await this.findOrCreateThread(rawSubject);
                  threadCache.set(normalizedSubject, threadId);
                }

                await this.prisma.email.create({
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

                  await this.prisma.activity.create({
                    data: {
                      type: 'EMAIL',
                      content: actContent,
                      customerId: customer.id,
                      ownerId: userId,
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
        where: { website: { not: null } },
        select: { id: true, website: true, companyName: true },
      });

      for (let i = 0; i < customers.length; i++) {
        const c = customers[i];
        if (!c.website) continue;
        const websiteDomain = c.website
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .split('/')[0]
          .toLowerCase();
        if (websiteDomain === domain || domain.endsWith('.' + websiteDomain)) {
          return c;
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
}
