import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreatePIDto } from './dto/create-pi.dto';
import { UpdatePIDto } from './dto/update-pi.dto';
import { QueryPIDto } from './dto/query-pi.dto';

@Injectable()
export class PIsService {
  private readonly logger = new Logger(PIsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(userId: string, role: string, dto: CreatePIDto) {
    const piNo = await this.generatePINo();

    const items = dto.items.map((item, index) => {
      const totalPrice = item.quantity * item.unitPrice;
      return {
        productName: item.productName,
        description: item.description,
        hsn: item.hsn,
        unit: item.unit || 'PCS',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice,
        sortOrder: index,
      };
    });

    let subtotal = 0;
    items.forEach((item) => {
      subtotal += item.totalPrice;
    });
    const shippingCharge = dto.shippingCharge || 0;
    const other = dto.other || 0;
    const totalAmount = subtotal + shippingCharge + other;

    // Non-admin users create with DRAFT status, admins create with APPROVED status
    const status = role === 'ADMIN' ? 'APPROVED' : 'DRAFT';

    const pi = await this.prisma.proformaInvoice.create({
      data: {
        piNo,
        customerId: dto.customerId,
        ownerId: userId,
        status,
        sellerId: dto.sellerId,
        sellerAddress: dto.sellerAddress,
        consigneeName: dto.consigneeName,
        consigneeAddress: dto.consigneeAddress,
        poNo: dto.poNo,
        currency: dto.currency || 'USD',
        tradeTerm: dto.tradeTerm,
        paymentTerm: dto.paymentTerm,
        shippingMethod: dto.shippingMethod,
        portOfLoading: dto.portOfLoading,
        portOfDischarge: dto.portOfDischarge,
        placeOfDelivery: dto.placeOfDelivery,
        paymentMethod: dto.paymentMethod,
        validityPeriod: dto.validityPeriod || 7,
        subtotal,
        shippingCharge,
        other,
        totalAmount,
        items: {
          create: items,
        },
      },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return pi;
  }

  async findAll(userId: string, role: string, query: QueryPIDto) {
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
        { piNo: { contains: query.keyword, mode: 'insensitive' } },
        { consigneeName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.proformaInvoice.findMany({
        where,
        include: {
          customer: { select: { id: true, companyName: true } },
          owner: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.proformaInvoice.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, userId: string, role: string) {
    const pi = await this.prisma.proformaInvoice.findUnique({
      where: { id },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!pi) {
      throw new NotFoundException('Proforma Invoice not found');
    }

    if (role !== 'ADMIN' && pi.ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return pi;
  }

  async update(id: string, userId: string, role: string, dto: UpdatePIDto) {
    const existing = await this.findOne(id, userId, role);

    // Only allow editing DRAFT PIs
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only edit PIs in DRAFT status',
      );
    }

    const updateData: any = {};

    if (dto.sellerId !== undefined) updateData.sellerId = dto.sellerId;
    if (dto.sellerAddress !== undefined) updateData.sellerAddress = dto.sellerAddress;
    if (dto.consigneeName !== undefined) updateData.consigneeName = dto.consigneeName;
    if (dto.consigneeAddress !== undefined) updateData.consigneeAddress = dto.consigneeAddress;
    if (dto.poNo !== undefined) updateData.poNo = dto.poNo;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.tradeTerm !== undefined) updateData.tradeTerm = dto.tradeTerm;
    if (dto.paymentTerm !== undefined) updateData.paymentTerm = dto.paymentTerm;
    if (dto.shippingMethod !== undefined) updateData.shippingMethod = dto.shippingMethod;
    if (dto.portOfLoading !== undefined) updateData.portOfLoading = dto.portOfLoading;
    if (dto.portOfDischarge !== undefined) updateData.portOfDischarge = dto.portOfDischarge;
    if (dto.placeOfDelivery !== undefined) updateData.placeOfDelivery = dto.placeOfDelivery;
    if (dto.paymentMethod !== undefined) updateData.paymentMethod = dto.paymentMethod;
    if (dto.validityPeriod !== undefined) updateData.validityPeriod = dto.validityPeriod;

    if (dto.items !== undefined) {
      await this.prisma.proformaInvoiceItem.deleteMany({ where: { piId: id } });

      const items = dto.items.map((item, index) => {
        const qty = item.quantity || existing.items[index]?.quantity || 0;
        const price = Number(item.unitPrice || existing.items[index]?.unitPrice || 0);
        return {
          piId: id,
          productName: item.productName || existing.items[index]?.productName || '',
          description: item.description,
          hsn: item.hsn,
          unit: item.unit || 'PCS',
          quantity: qty,
          unitPrice: price,
          totalPrice: qty * price,
          sortOrder: index,
        };
      });

      await this.prisma.proformaInvoiceItem.createMany({ data: items });

      let subtotal = 0;
      items.forEach((item) => {
        subtotal += item.totalPrice;
      });
      updateData.subtotal = subtotal;
      const newShippingCharge = dto.shippingCharge !== undefined ? dto.shippingCharge : Number(existing.shippingCharge);
      const newOther = dto.other !== undefined ? dto.other : Number(existing.other);
      updateData.totalAmount = subtotal + newShippingCharge + newOther;
    }

    if (dto.shippingCharge !== undefined) {
      updateData.shippingCharge = dto.shippingCharge;
      if (!dto.items) {
        const newOther = dto.other !== undefined ? dto.other : Number(existing.other);
        updateData.totalAmount = Number(existing.subtotal) + dto.shippingCharge + newOther;
      }
    }

    if (dto.other !== undefined) {
      updateData.other = dto.other;
      if (!dto.items && dto.shippingCharge === undefined) {
        updateData.totalAmount = Number(existing.subtotal) + Number(existing.shippingCharge) + dto.other;
      }
    }

    return this.prisma.proformaInvoice.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async remove(id: string, userId: string, role: string) {
    const pi = await this.findOne(id, userId, role);

    // Only allow deleting DRAFT PIs
    if (pi.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only delete PIs in DRAFT status',
      );
    }

    return this.prisma.proformaInvoice.delete({ where: { id } });
  }

  async submitForApproval(id: string, userId: string) {
    const pi = await this.findOne(id, userId, 'SALESPERSON');

    if (pi.status !== 'DRAFT') {
      throw new BadRequestException(
        'Can only submit DRAFT PIs for approval',
      );
    }

    return this.prisma.proformaInvoice.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async approvePI(id: string, userId: string, role: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can approve PIs');
    }

    const pi = await this.prisma.proformaInvoice.findUnique({ where: { id } });

    if (!pi) {
      throw new NotFoundException('Proforma Invoice not found');
    }

    if (pi.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Can only approve PIs in PENDING_APPROVAL status',
      );
    }

    return this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approverId: userId,
        approvedAt: new Date(),
      },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async rejectPI(id: string, userId: string, role: string, reason: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can reject PIs');
    }

    const pi = await this.prisma.proformaInvoice.findUnique({ where: { id } });

    if (!pi) {
      throw new NotFoundException('Proforma Invoice not found');
    }

    if (pi.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Can only reject PIs in PENDING_APPROVAL status',
      );
    }

    return this.prisma.proformaInvoice.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approverId: userId,
        rejectionReason: reason,
      },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async generatePdf(id: string, userId: string, role: string): Promise<Buffer> {
    const pi = await this.findOne(id, userId, role);

    // Only admins can generate PDF from any status, non-admins can only generate from APPROVED
    if (role !== 'ADMIN' && pi.status !== 'APPROVED') {
      throw new ForbiddenException(
        'Cannot generate PDF for unapproved PIs',
      );
    }

    // Get bank info from settings
    const bankInfo = await this.settingsService.getBankInfo();

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // Register font for Chinese characters
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

        // Helper function to draw borders
        const drawRect = (x: number, y: number, w: number, h: number) => {
          doc.rect(x, y, w, h).stroke();
        };

        let currentY = 50;

        // Header: PI title and logo
        doc.fontSize(16).font('Helvetica-Bold').text('Proforma Invoice', 50, currentY, { align: 'center' });
        doc.fontSize(10).font('Helvetica').text(`PI No: ${pi.piNo}`, 50, currentY + 25, { align: 'center' });
        currentY += 50;

        // Section 1: Seller info and basic details
        const col1Width = 280;
        const col2Width = 210;
        const colSpacing = 20;

        // Section 1a: Seller info (left)
        doc.fontSize(10).font('Helvetica-Bold').text('1. SELLER / EXPORTER', 50, currentY);
        currentY += 15;
        drawRect(50, currentY, col1Width, 80);
        doc.fontSize(9).font('Helvetica');
        const sellerName = pi.sellerId || 'Company Name';
        doc.text(sellerName, 55, currentY + 5, { width: col1Width - 10 });
        if (pi.sellerAddress) {
          doc.text(pi.sellerAddress, 55, currentY + 25, { width: col1Width - 10 });
        }
        currentY += 85;

        // Section 1b: Basic details (right)
        const detailsX = 50 + col1Width + colSpacing;
        doc.fontSize(10).font('Helvetica-Bold').text('3. INVOICE NO.', detailsX, currentY - 35);
        drawRect(detailsX, currentY - 20, col2Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.piNo, detailsX + 5, currentY - 17, { width: col2Width - 10 });

        doc.fontSize(10).font('Helvetica-Bold').text('4. DATE', detailsX + col2Width / 2, currentY - 35);
        drawRect(detailsX + col2Width / 2, currentY - 20, col2Width / 2, 20);
        const dateStr = pi.createdAt.toISOString().split('T')[0];
        doc.fontSize(9).font('Helvetica').text(dateStr, detailsX + col2Width / 2 + 5, currentY - 17);

        doc.fontSize(10).font('Helvetica-Bold').text('5. PO NO.', detailsX, currentY - 15);
        drawRect(detailsX, currentY, col2Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.poNo || '', detailsX + 5, currentY + 3, { width: col2Width - 10 });

        doc.fontSize(10).font('Helvetica-Bold').text('6. CURRENCY', detailsX + col2Width / 2, currentY - 15);
        drawRect(detailsX + col2Width / 2, currentY, col2Width / 2, 20);
        doc.fontSize(9).font('Helvetica').text(pi.currency, detailsX + col2Width / 2 + 5, currentY + 3);

        currentY += 25;

        // Section 2: Consignee info
        doc.fontSize(10).font('Helvetica-Bold').text('2. CONSIGNEE AND ADDRESS', 50, currentY);
        currentY += 15;
        drawRect(50, currentY, col1Width, 80);
        doc.fontSize(9).font('Helvetica');
        doc.text(pi.consigneeName || 'Consignee Name', 55, currentY + 5, { width: col1Width - 10 });
        if (pi.consigneeAddress) {
          doc.text(pi.consigneeAddress, 55, currentY + 25, { width: col1Width - 10 });
        }

        // Shipping details (right)
        doc.fontSize(10).font('Helvetica-Bold').text('7. SHIPPING METHOD', detailsX, currentY);
        drawRect(detailsX, currentY + 15, col2Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.shippingMethod || '', detailsX + 5, currentY + 18, { width: col2Width - 10 });

        doc.fontSize(10).font('Helvetica-Bold').text('8. PORT OF LOADING', detailsX, currentY + 40);
        drawRect(detailsX, currentY + 55, col2Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.portOfLoading || '', detailsX + 5, currentY + 58, { width: col2Width - 10 });

        currentY += 85;

        // More shipping details
        doc.fontSize(10).font('Helvetica-Bold').text('9. PORT OF DISCHARGE', 50, currentY);
        drawRect(50, currentY + 15, col1Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.portOfDischarge || '', 55, currentY + 18, { width: col1Width - 10 });

        doc.fontSize(10).font('Helvetica-Bold').text('10. PLACE OF DELIVERY', detailsX, currentY);
        drawRect(detailsX, currentY + 15, col2Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.placeOfDelivery || '', detailsX + 5, currentY + 18, { width: col2Width - 10 });

        currentY += 40;

        // Payment details
        doc.fontSize(10).font('Helvetica-Bold').text('11. PAYMENT METHOD', 50, currentY);
        drawRect(50, currentY + 15, col1Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.paymentMethod || '', 55, currentY + 18, { width: col1Width - 10 });

        doc.fontSize(10).font('Helvetica-Bold').text('12. TRADE TERM', detailsX, currentY);
        drawRect(detailsX, currentY + 15, col2Width, 20);
        doc.fontSize(9).font('Helvetica').text(pi.tradeTerm || '', detailsX + 5, currentY + 18, { width: col2Width - 10 });

        currentY += 40;

        doc.fontSize(10).font('Helvetica-Bold').text('13. PAYMENT TERM', 50, currentY);
        drawRect(50, currentY + 15, 540, 20);
        const paymentTermMap: Record<string, string> = {
          T_30: '30% T/T in Advance',
          T_50: '50% T/T in Advance',
          T_70: '70% T/T in Advance',
          T_100: 'T/T 100% in Advance',
        };
        const paymentTermText = pi.paymentTerm ? paymentTermMap[pi.paymentTerm] : '';
        doc.fontSize(9).font('Helvetica').text(paymentTermText, 55, currentY + 18, { width: 530 });

        currentY += 40;

        // Items table
        doc.fontSize(9).font('Helvetica-Bold').text('14. MARKS/NOS', 50, currentY);
        doc.fontSize(9).text('15. DESCRIPTION OF GOODS', 120, currentY);
        doc.fontSize(9).text('HSN', 320, currentY);
        doc.fontSize(9).text('16. QUANTITY', 360, currentY);
        doc.fontSize(9).text('17. UNIT PRICE', 420, currentY);
        doc.fontSize(9).text('18. AMOUNT', 490, currentY);

        currentY += 15;

        // Items
        const tableColWidths = [70, 200, 40, 60, 70, 60];
        const tableColX = [50, 120, 320, 360, 420, 490];

        pi.items.forEach((item, index) => {
          if (currentY > 700) {
            doc.addPage();
            currentY = 50;
          }

          drawRect(50, currentY, 540, 20);
          doc.fontSize(8).font('Helvetica');
          doc.text(item.hsn || 'N/M', tableColX[2] + 2, currentY + 5);
          doc.text(String(item.quantity), tableColX[3] + 2, currentY + 5);
          doc.text(`${pi.currency} ${Number(item.unitPrice).toFixed(2)}`, tableColX[4] + 2, currentY + 5);
          doc.text(`${pi.currency} ${Number(item.totalPrice).toFixed(2)}`, tableColX[5] + 2, currentY + 5);

          doc.fontSize(8).font('Helvetica');
          doc.text(item.productName, tableColX[1] + 2, currentY + 5, { width: 180 });

          currentY += 20;
        });

        // Totals
        drawRect(50, currentY, 540, 20);
        doc.fontSize(9).font('Helvetica-Bold').text('SUBTOTAL', 420, currentY + 5);
        doc.text(`${pi.currency} ${Number(pi.subtotal).toFixed(2)}`, 490, currentY + 5);

        currentY += 20;

        drawRect(50, currentY, 540, 20);
        doc.fontSize(9).font('Helvetica-Bold').text('SHIPPING CHARGE', 420, currentY + 5);
        doc.text(`${pi.currency} ${Number(pi.shippingCharge).toFixed(2)}`, 490, currentY + 5);

        currentY += 20;

        if (Number(pi.other) > 0) {
          drawRect(50, currentY, 540, 20);
          doc.fontSize(9).font('Helvetica-Bold').text('OTHER', 420, currentY + 5);
          doc.text(`${pi.currency} ${Number(pi.other).toFixed(2)}`, 490, currentY + 5);
          currentY += 20;
        }

        drawRect(50, currentY, 540, 25);
        doc.fontSize(10).font('Helvetica-Bold').text('TOTAL VALUE', 420, currentY + 7);
        doc.text(`${pi.currency} ${Number(pi.totalAmount).toFixed(2)}`, 490, currentY + 7);

        currentY += 30;

        // Validity period
        doc.fontSize(10).font('Helvetica-Bold').text(`Validity Period: ${pi.validityPeriod} DAYS`, 50, currentY);

        currentY += 30;

        // Bank info
        if (bankInfo) {
          doc.fontSize(10).font('Helvetica-Bold').text('BANK INFORMATION', 50, currentY);
          currentY += 15;

          const bankDetails = [
            `Account Number: ${bankInfo.accountNumber || ''}`,
            `Holder Name: ${bankInfo.holderName || ''}`,
            `Support Currency: ${bankInfo.currency || ''}`,
            `Bank Name: ${bankInfo.bankName || ''}`,
            `Country: ${bankInfo.country || ''}`,
            `Bank Address: ${bankInfo.bankAddress || ''}`,
            `Account Type: ${bankInfo.accountType || ''}`,
            `Swift/BIC: ${bankInfo.swiftBic || ''}`,
            bankInfo.routingNumber ? `Routing Number: ${bankInfo.routingNumber}` : '',
          ];

          doc.fontSize(8).font('Helvetica');
          bankDetails.forEach((detail) => {
            if (detail) {
              doc.text(detail, 50, currentY);
              currentY += 12;
            }
          });

          if (bankInfo.paymentMemo) {
            currentY += 10;
            doc.fontSize(8).font('Helvetica-Bold').text('Payment Instructions:', 50, currentY);
            currentY += 12;
            doc.fontSize(8).font('Helvetica').text(bankInfo.paymentMemo, 50, currentY, { width: 490 });
          }
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private async generatePINo(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    const prefix = `PI-${dateStr}-`;

    const lastPI = await this.prisma.proformaInvoice.findFirst({
      where: { piNo: { startsWith: prefix } },
      orderBy: { piNo: 'desc' },
    });

    let seq = 1;
    if (lastPI) {
      const lastSeq = parseInt(lastPI.piNo.replace(prefix, ''), 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(3, '0')}`;
  }
}
