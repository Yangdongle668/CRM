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

  async sendEmail(userId: string, dto: SendEmailDto) {
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

    try {
      const mailOptions: any = {
        from: fromAddress,
        to: dto.toAddr,
        cc: dto.cc || undefined,
        bcc: dto.bcc || undefined,
        subject: dto.subject,
        html: htmlBody,
      };

      if (inReplyToMessageId) {
        mailOptions.inReplyTo = inReplyToMessageId;
        mailOptions.references = [inReplyToMessageId];
      }

      const info = await transporter.sendMail(mailOptions);

      const email = await this.prisma.email.create({
        data: {
          messageId: info.messageId,
          fromAddr: config.smtpUser,
          toAddr: dto.toAddr,
          cc: dto.cc,
          bcc: dto.bcc,
          subject: dto.subject,
          bodyHtml: htmlBody,
          direction: 'OUTBOUND',
          status: 'SENT',
          sentAt: new Date(),
          customerId: dto.customerId || null,
          senderId: userId,
          threadId: threadId || null,
        },
        include: {
          customer: true,
        },
      });

      return email;
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);

      await this.prisma.email.create({
        data: {
          fromAddr: config.smtpUser,
          toAddr: dto.toAddr,
          cc: dto.cc,
          bcc: dto.bcc,
          subject: dto.subject,
          bodyHtml: htmlBody,
          direction: 'OUTBOUND',
          status: 'FAILED',
          customerId: dto.customerId || null,
          senderId: userId,
          threadId: threadId || null,
        },
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

        // Fetch emails from last 7 days
        const since = new Date();
        since.setDate(since.getDate() - 7);

        imap.search(['ALL', ['SINCE', since]], (searchErr: any, results: number[]) => {
          if (searchErr) {
            this.logger.warn(
              `Search failed in ${folderName}: ${searchErr.message}`,
            );
            return resolve(0);
          }

          if (!results || results.length === 0) {
            return resolve(0);
          }

          // Take last 50 messages max
          const toFetch = results.slice(-50);
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

        // Check top-level folders for \Sent attribute or common names
        const sentNames = [
          'Sent',
          'Sent Messages',
          'Sent Items',
          'INBOX.Sent',
          'INBOX.Sent Messages',
          '已发送',
          '已发邮件',
        ];

        // First: check for special-use \Sent attribute at top level
        for (const [name, box] of Object.entries(boxes)) {
          const attribs = (box as any).attribs || [];
          if (
            attribs.includes('\\Sent') ||
            attribs.includes('\\sent')
          ) {
            return resolve(name);
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
          // Check for \Sent attribute in children
          for (const [childName, childBox] of Object.entries(children)) {
            const attribs = (childBox as any).attribs || [];
            if (
              attribs.includes('\\Sent') ||
              attribs.includes('\\sent')
            ) {
              return resolve(`${gmailKey}/${childName}`);
            }
          }
          // Fallback: common Gmail sent names
          const gmailSentNames = [
            'Sent Mail',
            '已发送邮件',
            'Sent',
            'Sent Messages',
          ];
          for (const name of gmailSentNames) {
            if (children[name]) {
              return resolve(`${gmailKey}/${name}`);
            }
          }
        }

        // Fourth: check Namespaces or nested INBOX children
        if (boxes['INBOX'] && (boxes['INBOX'] as any).children) {
          const inboxChildren = (boxes['INBOX'] as any).children;
          for (const [childName, childBox] of Object.entries(inboxChildren)) {
            const attribs = (childBox as any).attribs || [];
            if (
              attribs.includes('\\Sent') ||
              attribs.includes('\\sent')
            ) {
              return resolve(`INBOX/${childName}`);
            }
          }
          // Common nested names
          if (inboxChildren['Sent']) return resolve('INBOX/Sent');
          if (inboxChildren['Sent Messages'])
            return resolve('INBOX/Sent Messages');
        }

        resolve(null);
      });
    });
  }

  private async autoMatchCustomer(emailAddress: string) {
    // Match by contact email
    const contact = await this.prisma.contact.findFirst({
      where: { email: emailAddress },
      include: { customer: true },
    });

    if (contact) {
      return contact.customer;
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
