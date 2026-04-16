import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';
import {
  QUEUE_PDF,
  PDF_JOB_SEND_QUOTATION,
} from '../../queue/queue.constants';

@Injectable()
export class QuotationsService {
  private readonly logger = new Logger(QuotationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailsService: EmailsService,
    @Optional()
    @InjectQueue(QUEUE_PDF)
    private readonly pdfQueue?: Queue,
  ) {}

  async create(userId: string, dto: CreateQuotationDto) {
    const quotationNo = await this.generateQuotationNo();

    const items = dto.items.map((item, index) => ({
      productName: item.productName,
      description: item.description,
      unit: item.unit || 'PCS',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
      sortOrder: index,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    const quotation = await this.prisma.quotation.create({
      data: {
        quotationNo,
        customerId: dto.customerId,
        ownerId: userId,
        title: dto.title,
        currency: dto.currency || 'USD',
        totalAmount,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        terms: dto.terms,
        remark: dto.remark,
        items: {
          create: items,
        },
      },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return quotation;
  }

  async findAll(userId: string, role: string, query: QueryQuotationDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (role !== 'ADMIN') {
      where.ownerId = userId;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.keyword) {
      where.OR = [
        { quotationNo: { contains: query.keyword, mode: 'insensitive' } },
        { title: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: {
          customer: { select: { id: true, companyName: true } },
          owner: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, userId: string, role: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!quotation) {
      throw new NotFoundException('Quotation not found');
    }

    if (role !== 'ADMIN' && quotation.ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return quotation;
  }

  async update(id: string, userId: string, role: string, dto: UpdateQuotationDto) {
    const existing = await this.findOne(id, userId, role);

    const updateData: any = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.validUntil !== undefined)
      updateData.validUntil = new Date(dto.validUntil);
    if (dto.terms !== undefined) updateData.terms = dto.terms;
    if (dto.remark !== undefined) updateData.remark = dto.remark;

    if (dto.items !== undefined) {
      // Delete existing items and recreate
      await this.prisma.quotationItem.deleteMany({
        where: { quotationId: id },
      });

      const items = dto.items.map((item, index) => ({
        quotationId: id,
        productName: item.productName,
        description: item.description,
        unit: item.unit || 'PCS',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        sortOrder: index,
      }));

      await this.prisma.quotationItem.createMany({ data: items });

      updateData.totalAmount = items.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );
    }

    return this.prisma.quotation.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async remove(id: string, userId: string, role: string) {
    await this.findOne(id, userId, role);
    return this.prisma.quotation.delete({ where: { id } });
  }

  async generatePdf(id: string, userId: string, role: string): Promise<Buffer> {
    const quotation = await this.findOne(id, userId, role);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Try to register a Chinese-capable font if available
        const fontPaths = [
          '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
        ];

        let fontRegistered = false;
        for (const fontPath of fontPaths) {
          if (fs.existsSync(fontPath)) {
            doc.registerFont('Chinese', fontPath);
            doc.font('Chinese');
            fontRegistered = true;
            break;
          }
        }

        if (!fontRegistered) {
          doc.font('Helvetica');
        }

        // Header
        doc.fontSize(20).text('QUOTATION', { align: 'center' });
        doc.moveDown(0.5);

        // Quotation info
        doc.fontSize(10);
        doc.text(`Quotation No: ${quotation.quotationNo}`);
        doc.text(
          `Date: ${quotation.createdAt.toISOString().split('T')[0]}`,
        );
        if (quotation.validUntil) {
          doc.text(
            `Valid Until: ${quotation.validUntil.toISOString().split('T')[0]}`,
          );
        }
        doc.text(`Currency: ${quotation.currency}`);
        doc.moveDown(0.5);

        // Customer info
        doc.fontSize(12).text('To:', { underline: true });
        doc.fontSize(10).text(quotation.customer.companyName);
        if (quotation.customer.address) {
          doc.text(quotation.customer.address);
        }
        doc.moveDown();

        // Title
        doc.fontSize(12).text(quotation.title, { underline: true });
        doc.moveDown(0.5);

        // Table header
        const tableTop = doc.y;
        const colWidths = [30, 160, 60, 70, 80, 90];
        const colX = [50, 80, 240, 300, 370, 450];

        doc.fontSize(9);
        doc
          .rect(50, tableTop, 490, 20)
          .fill('#f0f0f0')
          .fill('#000000');
        doc.text('#', colX[0], tableTop + 5, { width: colWidths[0] });
        doc.text('Product', colX[1], tableTop + 5, { width: colWidths[1] });
        doc.text('Unit', colX[2], tableTop + 5, { width: colWidths[2] });
        doc.text('Qty', colX[3], tableTop + 5, {
          width: colWidths[3],
          align: 'right',
        });
        doc.text('Unit Price', colX[4], tableTop + 5, {
          width: colWidths[4],
          align: 'right',
        });
        doc.text('Total', colX[5], tableTop + 5, {
          width: colWidths[5],
          align: 'right',
        });

        // Table rows
        let y = tableTop + 25;
        quotation.items.forEach((item: any, index: number) => {
          if (y > 720) {
            doc.addPage();
            y = 50;
          }

          doc.text(String(index + 1), colX[0], y, { width: colWidths[0] });
          doc.text(item.productName, colX[1], y, { width: colWidths[1] });
          doc.text(item.unit, colX[2], y, { width: colWidths[2] });
          doc.text(String(item.quantity), colX[3], y, {
            width: colWidths[3],
            align: 'right',
          });
          doc.text(Number(item.unitPrice).toFixed(2), colX[4], y, {
            width: colWidths[4],
            align: 'right',
          });
          doc.text(Number(item.totalPrice).toFixed(2), colX[5], y, {
            width: colWidths[5],
            align: 'right',
          });

          if (item.description) {
            y += 15;
            doc
              .fontSize(8)
              .fillColor('#666666')
              .text(item.description, colX[1], y, { width: 300 });
            doc.fontSize(9).fillColor('#000000');
          }

          y += 20;
        });

        // Total
        y += 10;
        doc
          .moveTo(50, y)
          .lineTo(540, y)
          .stroke();
        y += 10;
        doc
          .fontSize(12)
          .text(
            `Total: ${quotation.currency} ${Number(quotation.totalAmount).toFixed(2)}`,
            350,
            y,
            { width: 190, align: 'right' },
          );

        // Terms
        if (quotation.terms) {
          y += 40;
          doc.fontSize(11).text('Terms & Conditions:', 50, y, {
            underline: true,
          });
          y += 18;
          doc.fontSize(9).text(quotation.terms, 50, y, { width: 490 });
        }

        // Remark
        if (quotation.remark) {
          doc.moveDown(2);
          doc.fontSize(11).text('Remarks:', { underline: true });
          doc.fontSize(9).text(quotation.remark, { width: 490 });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Enqueue the quotation-send pipeline (PDF generation + SMTP send) so the
   * HTTP request returns immediately. Falls back to synchronous delivery if
   * the PDF queue is not configured.
   */
  async sendQuotation(id: string, userId: string, role: string) {
    // Access check first, so the user gets a 403/404 synchronously.
    await this.findOne(id, userId, role);

    if (this.pdfQueue) {
      const job = await this.pdfQueue.add(
        PDF_JOB_SEND_QUOTATION,
        { quotationId: id, userId, role },
        { jobId: `send-quotation-${id}-${Date.now()}` },
      );
      return {
        queued: true,
        jobId: job.id,
        message: 'Quotation send queued',
      };
    }

    this.logger.warn(
      'PDF queue not configured — falling back to synchronous quotation send',
    );
    return this.deliverQuotation(id, userId, role);
  }

  /**
   * Worker-side: actually generate the PDF + send the email. Used by the
   * PDF processor, and also by sendQuotation when no queue is configured.
   */
  async deliverQuotation(id: string, userId: string, role: string) {
    const quotation = await this.findOne(id, userId, role);

    // Get primary contact email
    const contact = await this.prisma.contact.findFirst({
      where: { customerId: quotation.customerId, isPrimary: true },
    });

    if (!contact?.email) {
      throw new NotFoundException(
        'No primary contact email found for this customer',
      );
    }

    // Generate PDF
    const pdfBuffer = await this.generatePdf(id, userId, role);

    // Save PDF to disk
    const uploadDir = path.join(process.cwd(), 'uploads', 'quotations');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const pdfFileName = `${quotation.quotationNo}.pdf`;
    const pdfPath = path.join(uploadDir, pdfFileName);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Send email with PDF attachment
    const config = await this.prisma.emailConfig.findFirst({
      where: { userId },
    });

    if (!config) {
      throw new NotFoundException(
        'Email configuration not found. Please configure SMTP settings.',
      );
    }

    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });

    const fromAddress = config.fromName
      ? `"${config.fromName}" <${config.smtpUser}>`
      : config.smtpUser;

    const htmlBody = `
      <p>Dear Customer,</p>
      <p>Please find attached our quotation <strong>${quotation.quotationNo}</strong> for your reference.</p>
      <p>Quotation: ${quotation.title}</p>
      <p>Total Amount: ${quotation.currency} ${Number(quotation.totalAmount).toFixed(2)}</p>
      ${quotation.validUntil ? `<p>Valid Until: ${quotation.validUntil.toISOString().split('T')[0]}</p>` : ''}
      <p>Please do not hesitate to contact us if you have any questions.</p>
      <p>Best Regards</p>
      ${config.signature ? `<br/>--<br/>${config.signature}` : ''}
    `;

    await transporter.sendMail({
      from: fromAddress,
      to: contact.email,
      subject: `Quotation ${quotation.quotationNo} - ${quotation.title}`,
      html: htmlBody,
      attachments: [
        {
          filename: pdfFileName,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    // Update quotation status and save email record
    await this.prisma.quotation.update({
      where: { id },
      data: { status: 'SENT', pdfUrl: `/uploads/quotations/${pdfFileName}` },
    });

    await this.prisma.email.create({
      data: {
        fromAddr: config.smtpUser,
        toAddr: contact.email,
        subject: `Quotation ${quotation.quotationNo} - ${quotation.title}`,
        bodyHtml: htmlBody,
        direction: 'OUTBOUND',
        status: 'SENT',
        sentAt: new Date(),
        customerId: quotation.customerId,
        senderId: userId,
      },
    });

    return { message: 'Quotation sent successfully', sentTo: contact.email };
  }

  private async generateQuotationNo(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    const prefix = `QT-${dateStr}-`;

    const lastQuotation = await this.prisma.quotation.findFirst({
      where: { quotationNo: { startsWith: prefix } },
      orderBy: { quotationNo: 'desc' },
    });

    let seq = 1;
    if (lastQuotation) {
      const lastSeq = parseInt(
        lastQuotation.quotationNo.replace(prefix, ''),
        10,
      );
      seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(3, '0')}`;
  }
}
