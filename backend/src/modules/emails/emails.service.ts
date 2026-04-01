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

  async sendEmail(userId: string, dto: SendEmailDto, requestOrigin?: string) {
    const config = await this.prisma.emailConfig.findUnique({
      where: { userId },
    });

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
      ? `"${config.fromName}" <${config.smtpUser}>`
      : config.smtpUser;

    let htmlBody = dto.bodyHtml;
    if (config.signature) {
      htmlBody += `<br/><br/>--<br/>${config.signature}`;
    }

    // Handle reply threading
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

    // Auto-match customer by recipient domain if not manually specified
    let customerId = dto.customerId || null;
    if (!customerId) {
      const matched = await this.autoMatchCustomer(dto.toAddr);
      if (matched) customerId = matched.id;
    }

    // Create email record first (as DRAFT) to get the ID for tracking pixel
    const emailRecord = await this.prisma.email.create({
      data: {
        fromAddr: config.smtpUser,
        toAddr: dto.toAddr,
        cc: dto.cc,
        bcc: dto.bcc,
        subject: dto.subject,
        bodyHtml: htmlBody,
        direction: 'OUTBOUND',
        status: 'DRAFT',
        customerId,
        senderId: userId,
        threadId: threadId || null,
      },
    });

    // Embed tracking pixel in HTML body
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

      // Update email record to SENT with messageId
      const email = await this.prisma.email.update({
        where: { id: emailRecord.id },
        data: {
          messageId: info.messageId,
          status: 'SENT',
          sentAt: new Date(),
          bodyHtml: htmlWithTracking,
        },
        include: {
          customer: true,
        },
      });

      // Create activity on customer timeline
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

      // Update record to FAILED
      await this.prisma.email.update({
        where: { id: emailRecord.id },
        data: { status: 'FAILED' },
      });

      throw new BadRequestException(`Failed to send email: ${error.message}`);
    }
  }

  async findAll(
    userId: string,
    role: string,
    query: {
      customerId?: string;
      direction?: string;
      page?: number;
      pageSize?: number;
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

    const [items, total] = await Promise.all([
      this.prisma.email.findMany({
        where,
        include: {
          customer: { select: { id: true, companyName: true } },
          sender: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.email.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, userId: string, role: string) {
    const where: any = { id };
    if (role !== 'ADMIN') {
      where.senderId = userId;
    }

    const email = await this.prisma.email.findFirst({
      where,
      include: {
        customer: true,
        sender: { select: { id: true, name: true, email: true } },
        thread: {
          include: {
            emails: {
              orderBy: { createdAt: 'asc' },
              include: {
                sender: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    return email;
  }

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

    // Get emails viewed in the last 24 hours
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

  async fetchEmails(userId: string): Promise<{ fetched: number }> {
    const config = await this.prisma.emailConfig.findUnique({
      where: { userId },
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
    });

    return new Promise((resolve, reject) => {
      let totalFetched = 0;

      imap.once('ready', async () => {
        try {
          // 1. Fetch from INBOX (inbound emails)
          const inboxCount = await this.fetchFromFolder(
            imap,
            userId,
            config.smtpUser,
            'INBOX',
            'INBOUND',
          );
          totalFetched += inboxCount;

          // 2. Find and fetch from Sent folder (outbound emails)
          const sentFolder = await this.findSentFolder(imap);
          if (sentFolder) {
            this.logger.log(`Found sent folder: ${sentFolder}`);
            const sentCount = await this.fetchFromFolder(
              imap,
              userId,
              config.smtpUser,
              sentFolder,
              'OUTBOUND',
            );
            totalFetched += sentCount;
          } else {
            this.logger.warn('No sent folder found on IMAP server');
          }

          imap.end();
          resolve({ fetched: totalFetched });
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

  /**
   * Fetch emails from a specific IMAP folder
   */
  private fetchFromFolder(
    imap: any,
    userId: string,
    userEmail: string,
    folderName: string,
    direction: 'INBOUND' | 'OUTBOUND',
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      imap.openBox(folderName, true, (err: any) => {
        if (err) {
          // If we can't open the folder, just skip (don't fail the whole fetch)
          this.logger.warn(
            `Failed to open folder ${folderName}: ${err.message}`,
          );
          return resolve(0);
        }

        // Fetch ALL emails in the folder (no date limit)
        imap.search(['ALL'], (searchErr: any, results: number[]) => {
          if (searchErr) {
            this.logger.warn(
              `Search failed in ${folderName}: ${searchErr.message}`,
            );
            return resolve(0);
          }

          if (!results || results.length === 0) {
            return resolve(0);
          }

          // Fetch all messages (no cap)
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

                // Skip if already stored
                if (messageId) {
                  const existing = await this.prisma.email.findUnique({
                    where: { messageId },
                  });
                  if (existing) return;
                }

                const fromAddr =
                  parsed.from?.value?.[0]?.address || 'unknown';
                const toAddr =
                  parsed.to?.value?.map((v) => v.address).join(', ') || '';
                const ccAddr =
                  parsed.cc?.value?.map((v) => v.address).join(', ') || null;

                // For outbound, match customer by recipient; for inbound, by sender
                const matchEmail =
                  direction === 'INBOUND' ? fromAddr : toAddr.split(',')[0]?.trim();
                const customer = matchEmail
                  ? await this.autoMatchCustomer(matchEmail)
                  : null;

                // Get sender display name
                const fromName =
                  parsed.from?.value?.[0]?.name || '';

                // Determine status
                const status =
                  direction === 'INBOUND' ? 'RECEIVED' : 'SENT';

                await this.prisma.email.create({
                  data: {
                    messageId,
                    fromAddr,
                    toAddr,
                    cc: ccAddr,
                    subject: parsed.subject || '(No Subject)',
                    bodyHtml: parsed.html || null,
                    bodyText: parsed.text || null,
                    direction,
                    status,
                    sentAt: direction === 'OUTBOUND' ? (parsed.date || new Date()) : null,
                    receivedAt: direction === 'INBOUND' ? (parsed.date || new Date()) : null,
                    customerId: customer?.id || null,
                    senderId: userId,
                  },
                });

                // Create activity record on customer timeline when auto-matched
                if (customer) {
                  const senderLabel = fromName
                    ? `${fromName} (${fromAddr})`
                    : fromAddr;
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
                this.logger.log(
                  `Fetched ${fetchedCount} emails from ${folderName}`,
                );
                resolve(fetchedCount);
              })
              .catch((promiseErr) => {
                this.logger.error(
                  `Error processing emails from ${folderName}: ${promiseErr.message}`,
                );
                resolve(fetchedCount);
              });
          });

          fetch.once('error', (fetchErr: any) => {
            this.logger.warn(
              `Fetch error in ${folderName}: ${fetchErr.message}`,
            );
            resolve(0);
          });
        });
      });
    });
  }

  /**
   * Find the Sent folder by trying common names and checking IMAP attributes
   */
  private findSentFolder(imap: any): Promise<string | null> {
    return new Promise((resolve) => {
      imap.getBoxes((err: any, boxes: any) => {
        if (err) {
          this.logger.warn(`Failed to list IMAP boxes: ${err.message}`);
          return resolve(null);
        }

        // Comprehensive list of sent folder names across providers
        const sentNames = [
          // Standard
          'Sent', 'SENT', 'sent',
          'Sent Items', 'Sent Messages', 'Sent Mail',
          // INBOX-prefixed (common on many providers)
          'INBOX.Sent', 'INBOX.Sent Messages', 'INBOX.Sent Items', 'INBOX.Sent Mail',
          // Chinese (QQ Mail, 163/网易企业邮箱, Foxmail, etc.)
          '已发送', '已发邮件', '已发送邮件',
          'INBOX.已发送', 'INBOX.已发邮件',
          '&XfJT0ZAB-', // UTF-7 encoded 已发送
          'INBOX.&XfJT0ZAB-',
          '&XfJSIJZk;', // UTF-7 variant for 已发邮件
          // Hostinger
          'INBOX.Sent', 'Sent',
          // Outlook / Exchange
          'Sent Items', 'SentItems',
          // Yahoo
          'Sent',
          // German
          'Gesendete Objekte', 'Gesendet',
          // French
          'Messages envoy\u00e9s', 'Envoy\u00e9s',
          // Spanish
          'Enviados', 'Mensajes enviados',
        ];

        // Helper: recursively flatten all folders into { path, attribs } list
        const flattenBoxes = (boxTree: any, prefix = ''): Array<{ path: string; attribs: string[] }> => {
          const result: Array<{ path: string; attribs: string[] }> = [];
          for (const [name, box] of Object.entries(boxTree)) {
            const path = prefix ? `${prefix}/${name}` : name;
            const attribs = (box as any).attribs || [];
            result.push({ path, attribs });
            if ((box as any).children) {
              result.push(...flattenBoxes((box as any).children, path));
            }
          }
          return result;
        };

        const allFolders = flattenBoxes(boxes);

        // First: check ALL folders for \Sent attribute (most reliable)
        for (let i = 0; i < allFolders.length; i++) {
          const folder = allFolders[i];
          if (
            folder.attribs.includes('\\Sent') ||
            folder.attribs.includes('\\sent')
          ) {
            return resolve(folder.path);
          }
        }

        // Second: check common top-level names
        for (const name of sentNames) {
          if (boxes[name]) {
            return resolve(name);
          }
        }

        // Third: check [Gmail] or [Google Mail] subfolder
        const gmailKey =
          Object.keys(boxes).find(
            (k) => k === '[Gmail]' || k === '[Google Mail]',
          ) || null;
        if (gmailKey && (boxes[gmailKey] as any).children) {
          const children = (boxes[gmailKey] as any).children;
          const gmailSentNames = [
            'Sent Mail', '已发送邮件', 'Sent', 'Sent Messages',
          ];
          for (const name of gmailSentNames) {
            if (children[name]) {
              return resolve(`${gmailKey}/${name}`);
            }
          }
        }

        // Fourth: check INBOX children
        if (boxes['INBOX'] && (boxes['INBOX'] as any).children) {
          const inboxChildren = (boxes['INBOX'] as any).children;
          const inboxSentNames = ['Sent', 'Sent Messages', 'Sent Items', 'Sent Mail', '已发送', '已发邮件'];
          for (const name of inboxSentNames) {
            if (inboxChildren[name]) {
              return resolve(`INBOX/${name}`);
            }
          }
        }

        // Fifth (fallback): scan all folders for name containing "sent" or "已发"
        const skipPatterns = /^(INBOX|Drafts|Trash|Junk|Spam|Archive|Deleted|Deleted Items|Deleted Messages|Notes|Outbox)$/i;
        for (let i = 0; i < allFolders.length; i++) {
          const folder = allFolders[i];
          const baseName = folder.path.split('/').pop() || '';
          if (skipPatterns.test(baseName)) continue;
          if (
            /sent/i.test(baseName) ||
            /已发/.test(baseName) ||
            /envoy/i.test(baseName) ||
            /enviados/i.test(baseName) ||
            /gesendet/i.test(baseName)
          ) {
            return resolve(folder.path);
          }
        }

        this.logger.warn('Could not find Sent folder after exhaustive search');
        resolve(null);
      });
    });
  }

  private async autoMatchCustomer(emailAddress: string) {
    // 1. Match by contact email (exact match)
    const contact = await this.prisma.contact.findFirst({
      where: { email: emailAddress },
      include: { customer: true },
    });

    if (contact) {
      return contact.customer;
    }

    // 2. Match by customer website domain
    const domain = emailAddress.split('@')[1]?.toLowerCase();
    if (domain && domain !== 'gmail.com' && domain !== 'yahoo.com' &&
        domain !== 'hotmail.com' && domain !== 'outlook.com' &&
        domain !== 'qq.com' && domain !== '163.com' && domain !== '126.com' &&
        domain !== 'foxmail.com' && domain !== 'icloud.com' &&
        domain !== 'live.com' && domain !== 'msn.com' &&
        domain !== 'aol.com' && domain !== 'mail.com' &&
        domain !== 'protonmail.com' && domain !== 'zoho.com') {
      // Search customers whose website contains this domain
      const customers = await this.prisma.customer.findMany({
        where: {
          website: { not: null },
        },
        select: { id: true, website: true, companyName: true },
      });

      for (let i = 0; i < customers.length; i++) {
        const c = customers[i];
        if (!c.website) continue;
        // Extract domain from website: "https://www.example.com/path" → "example.com"
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
