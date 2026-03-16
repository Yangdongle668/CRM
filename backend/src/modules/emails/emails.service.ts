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

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to: dto.toAddr,
        cc: dto.cc || undefined,
        bcc: dto.bcc || undefined,
        subject: dto.subject,
        html: htmlBody,
      });

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
        thread: { include: { emails: { orderBy: { createdAt: 'asc' } } } },
      },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
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

    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: config.imapUser,
        password: config.imapPass,
        host: config.imapHost,
        port: config.imapPort,
        tls: config.imapSecure,
        tlsOptions: { rejectUnauthorized: false },
      });

      let fetchedCount = 0;

      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            imap.end();
            return reject(
              new BadRequestException(`Failed to open inbox: ${err.message}`),
            );
          }

          // Fetch emails from last 7 days
          const since = new Date();
          since.setDate(since.getDate() - 7);

          imap.search(['ALL', ['SINCE', since]], (searchErr, results) => {
            if (searchErr) {
              imap.end();
              return reject(
                new BadRequestException(
                  `Search failed: ${searchErr.message}`,
                ),
              );
            }

            if (!results || results.length === 0) {
              imap.end();
              return resolve({ fetched: 0 });
            }

            // Take last 50 messages max
            const toFetch = results.slice(-50);
            const fetch = imap.fetch(toFetch, {
              bodies: '',
              struct: true,
            });

            const emailPromises: Promise<void>[] = [];

            fetch.on('message', (msg) => {
              msg.on('body', (stream) => {
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

                  // Auto-match customer by sender email address
                  const customer = await this.autoMatchCustomer(fromAddr);

                  await this.prisma.email.create({
                    data: {
                      messageId,
                      fromAddr,
                      toAddr,
                      cc: ccAddr,
                      subject: parsed.subject || '(No Subject)',
                      bodyHtml: parsed.html || null,
                      bodyText: parsed.text || null,
                      direction: 'INBOUND',
                      status: 'RECEIVED',
                      receivedAt: parsed.date || new Date(),
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
                  imap.end();
                  resolve({ fetched: fetchedCount });
                })
                .catch((promiseErr) => {
                  imap.end();
                  reject(promiseErr);
                });
            });

            fetch.once('error', (fetchErr) => {
              imap.end();
              reject(
                new BadRequestException(
                  `Fetch failed: ${fetchErr.message}`,
                ),
              );
            });
          });
        });
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
