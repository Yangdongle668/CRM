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
        countryOfOrigin: dto.countryOfOrigin,
        termsOfDelivery: dto.termsOfDelivery,
        notes: dto.notes,
        validityPeriod: dto.validityPeriod || 7,
        subtotal,
        shippingCharge,
        other,
        totalAmount,
        bankAccountId: dto.bankAccountId || null,
        templateId: dto.templateId || null,
        items: {
          create: items,
        },
      },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true } },
        bankAccount: true,
        template: true,
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
          bankAccount: { select: { id: true, alias: true } },
          template: { select: { id: true, name: true } },
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
        bankAccount: true,
        template: true,
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
    if (dto.countryOfOrigin !== undefined) updateData.countryOfOrigin = dto.countryOfOrigin;
    if (dto.termsOfDelivery !== undefined) updateData.termsOfDelivery = dto.termsOfDelivery;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
    if (dto.validityPeriod !== undefined) updateData.validityPeriod = dto.validityPeriod;
    if (dto.bankAccountId !== undefined) updateData.bankAccountId = dto.bankAccountId || null;
    if (dto.templateId !== undefined) updateData.templateId = dto.templateId || null;

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
        bankAccount: true,
        template: true,
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async remove(id: string, userId: string, role: string) {
    const pi = await this.findOne(id, userId, role);

    // Delete items first, then the PI
    await this.prisma.proformaInvoiceItem.deleteMany({ where: { piId: id } });
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
        bankAccount: true,
        template: true,
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
        bankAccount: true,
        template: true,
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
        bankAccount: true,
        template: true,
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async generatePdf(id: string, userId: string, role: string): Promise<Buffer> {
    const pi = await this.findOne(id, userId, role);

    if (role !== 'ADMIN' && pi.status !== 'APPROVED') {
      throw new ForbiddenException('Cannot generate PDF for unapproved PIs');
    }

    // If this PI picked a specific bank account, use it; otherwise fall back
    // to the default bank account (getBankInfoForPi handles that).
    const [bankInfo, logoUrl] = await Promise.all([
      this.settingsService.getBankInfoForPi(pi.bankAccountId),
      this.settingsService.getLogoUrl(),
    ]);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const buffers: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // ── Layout constants ───────────────────────────────────
        // PDF reference uses a single outer table with the info grid on
        // top, the items table in the middle and a trailing bank-info
        // block at the bottom. All values inside cells are blue, centered.
        const L = 40;             // left margin
        const T = 30;             // top margin
        const PW = 595;           // page width (A4)
        const CW = PW - L * 2;    // content width = 515
        // Split the info grid down the middle so the seller/consignee
        // column is the same width as the right-side info pairs combined.
        const leftColW = Math.floor(CW / 2);     // 257
        const rCW = CW - leftColW;               // 258
        const rHalfW = rCW / 2;                  // 129
        const midX = L + leftColW;

        const BLUE = '#1155CC';
        const DARK = '#111111';
        const GRAY = '#555555';
        const LINE = '#666666';

        const setFont = (bold: boolean, size: number) =>
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);

        const border = (x: number, y: number, w: number, h: number) =>
          doc.rect(x, y, w, h).strokeColor(LINE).lineWidth(0.6).stroke();

        /**
         * Map common full-width CJK punctuation to ASCII. Helvetica has no
         * glyphs for these codepoints, so leaving them in would produce
         * garbage ("y" placeholders) in the rendered PDF. We run every
         * user-supplied string through this before drawing.
         */
        const norm = (s: string | null | undefined): string => {
          if (!s) return '';
          return String(s)
            .replace(/：/g, ':')
            .replace(/，/g, ',')
            .replace(/；/g, ';')
            .replace(/（/g, '(')
            .replace(/）/g, ')')
            .replace(/！/g, '!')
            .replace(/？/g, '?')
            .replace(/【/g, '[')
            .replace(/】/g, ']')
            .replace(/　/g, ' ');
        };

        /**
         * Shrink-to-fit: start from `baseSize` and reduce by 1 until the
         * string fits within `maxW` at the current font, down to `minSize`.
         * Returns the size that was ultimately applied. The caller is
         * expected to keep the font state (we leave the doc at that size).
         */
        const fitSize = (
          txt: string,
          maxW: number,
          bold: boolean,
          baseSize: number,
          minSize = 6,
        ): number => {
          let size = baseSize;
          setFont(bold, size);
          while (doc.widthOfString(txt) > maxW && size > minSize) {
            size -= 1;
            setFont(bold, size);
          }
          return size;
        };

        const LABEL_HEIGHT = 10;

        /** 标签：cell 左上角的小灰字题号 (e.g. "3. INVOICE NO.") */
        const label = (txt: string, x: number, y: number, w: number) => {
          setFont(false, 7.5);
          doc.fillColor(DARK).text(txt, x + 4, y + 3, {
            width: w - 8,
            lineBreak: false,
          });
        };

        /**
         * Centered blue value inside a cell. Auto-shrinks the font if it
         * would overflow, and centers vertically in the area below the
         * label band. Pass align='right' for the amount column where the
         * value hugs the right edge.
         */
        const value = (
          txt: string | null | undefined,
          x: number,
          y: number,
          w: number,
          h: number,
          opts: {
            align?: 'left' | 'center' | 'right';
            baseSize?: number;
            hasLabel?: boolean;
          } = {},
        ) => {
          const safe = norm(txt);
          if (!safe) return;
          const { align = 'center', baseSize = 9.5, hasLabel = true } = opts;
          const size = fitSize(safe, w - 8, false, baseSize, 6);
          const reservedTop = hasLabel ? LABEL_HEIGHT : 0;
          const yOff = reservedTop + (h - reservedTop - size) / 2;
          doc.fillColor(BLUE).text(safe, x + 4, y + yOff, {
            width: w - 8,
            align,
            lineBreak: false,
          });
        };

        /** Multi-line left-aligned blue value (seller/consignee blocks). */
        const valueBlock = (
          txt: string,
          x: number,
          y: number,
          w: number,
          baseSize = 9,
        ) => {
          const safe = norm(txt);
          if (!safe) return y;
          setFont(false, baseSize);
          doc.fillColor(BLUE).text(safe, x + 4, y, { width: w - 8 });
          return doc.y;
        };

        let cy = T;

        // ══════════════════════════════════════════════════════
        // 1. TITLE + LOGO ROW (no borders, just positioning)
        // ══════════════════════════════════════════════════════
        const titleH = 55;
        setFont(true, 24);
        doc.fillColor(DARK).text('Proforma Invoice', L, cy + 14, {
          width: CW,
          align: 'center',
          lineBreak: false,
        });

        if (logoUrl) {
          const absPath = path.join(process.cwd(), logoUrl.replace(/^\//, ''));
          if (fs.existsSync(absPath)) {
            try {
              doc.image(absPath, PW - L - 150, cy + 6, { fit: [150, 46] });
            } catch {
              /* skip bad image */
            }
          }
        }
        cy += titleH;

        // ══════════════════════════════════════════════════════
        // 2. INFO GRID
        //    Left column holds SELLER (3 rows tall) + CONSIGNEE
        //    (4 rows tall, last row being TERMS OF DELIVERY).
        //    Right column is a 2-wide grid for rows 1-5, then a
        //    full-width PAYMENT TERM row and a full-width TERMS
        //    OF DELIVERY row at the bottom.
        // ══════════════════════════════════════════════════════
        const rH = 30;        // standard right-side row height
        const termsH = 40;    // terms of delivery: taller for 2 lines
        const sellerH = rH * 3;                     // 90
        const consigneeH = rH * 2 + rH + termsH;    // 130 (2 pair rows + payment term + terms)

        // ── Left column: SELLER block ────────────────────────
        border(L, cy, leftColW, sellerH);
        label('1. SELLER / EXPORTER', L, cy, leftColW);
        let sellerY = cy + 14;
        if (pi.sellerId) {
          setFont(false, 9.5);
          doc.fillColor(BLUE).text(norm(pi.sellerId), L + 4, sellerY, {
            width: leftColW - 8,
          });
          sellerY = doc.y + 1;
        }
        if (pi.sellerAddress) {
          valueBlock(pi.sellerAddress, L, sellerY, leftColW, 8.5);
        }

        // Right grid rows (3 × rH wide):
        // Row A: invoice no | date
        border(midX, cy, rHalfW, rH);
        label('3. INVOICE NO.', midX, cy, rHalfW);
        value(pi.piNo, midX, cy, rHalfW, rH);

        border(midX + rHalfW, cy, rHalfW, rH);
        label('4. DATE', midX + rHalfW, cy, rHalfW);
        const dateStr = pi.createdAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        value(dateStr, midX + rHalfW, cy, rHalfW, rH);

        // Row B: po no | currency
        const rowB = cy + rH;
        border(midX, rowB, rHalfW, rH);
        label('5. PO NO.', midX, rowB, rHalfW);
        value(pi.poNo || '', midX, rowB, rHalfW, rH);

        border(midX + rHalfW, rowB, rHalfW, rH);
        label('6. CURRENCY', midX + rHalfW, rowB, rHalfW);
        value(pi.currency, midX + rHalfW, rowB, rHalfW, rH);

        // Row C: shipping method | port of loading
        const rowC = cy + rH * 2;
        border(midX, rowC, rHalfW, rH);
        label('7. SHIPPING METHOD', midX, rowC, rHalfW);
        value(pi.shippingMethod || 'N/A', midX, rowC, rHalfW, rH);

        border(midX + rHalfW, rowC, rHalfW, rH);
        label('8. PORT OF LOADING', midX + rHalfW, rowC, rHalfW);
        value(pi.portOfLoading || 'N/A', midX + rHalfW, rowC, rHalfW, rH);

        cy += sellerH;

        // ── Left column: CONSIGNEE block ─────────────────────
        border(L, cy, leftColW, consigneeH);
        label('2. CONSIGNEE AND ADDRESS', L, cy, leftColW);
        let conY = cy + 14;
        if (pi.consigneeName) {
          setFont(false, 9.5);
          doc.fillColor(BLUE).text(norm(pi.consigneeName), L + 4, conY, {
            width: leftColW - 8,
          });
          conY = doc.y + 1;
        }
        if (pi.consigneeAddress) {
          valueBlock(pi.consigneeAddress, L, conY, leftColW, 8.5);
        }

        // Row D: port of discharge | place of delivery
        border(midX, cy, rHalfW, rH);
        label('9. PORT OF DISCHARGE', midX, cy, rHalfW);
        value(pi.portOfDischarge || 'N/A', midX, cy, rHalfW, rH);

        border(midX + rHalfW, cy, rHalfW, rH);
        label('10. PLACE OF DELIVERY', midX + rHalfW, cy, rHalfW);
        value(pi.placeOfDelivery || 'N/A', midX + rHalfW, cy, rHalfW, rH);

        // Row E: payment method | trade term
        const rowE = cy + rH;
        border(midX, rowE, rHalfW, rH);
        label('11. PAYMENT METHOD', midX, rowE, rHalfW);
        value(pi.paymentMethod || 'N/A', midX, rowE, rHalfW, rH);

        border(midX + rHalfW, rowE, rHalfW, rH);
        label('12. TRADE TERM:', midX + rHalfW, rowE, rHalfW);
        // If both trade term and place of delivery are set, combine them
        // e.g. "EXW Dongguan" (matches the reference template exactly).
        const tradeTermText = pi.tradeTerm
          ? pi.placeOfDelivery
            ? `${pi.tradeTerm} ${pi.placeOfDelivery}`
            : pi.tradeTerm
          : '';
        value(tradeTermText, midX + rHalfW, rowE, rHalfW, rH);

        // Row F (full width): payment term
        const rowF = cy + rH * 2;
        border(midX, rowF, rCW, rH);
        label('13. PAYMENT TERM', midX, rowF, rCW);
        const ptMap: Record<string, string> = {
          T_30: '30% Advance & 70% before dispatch',
          T_50: '50% Advance & 50% before dispatch',
          T_70: '70% Advance & 30% before dispatch',
          T_100: '100% in advance',
        };
        value(pi.paymentTerm ? ptMap[pi.paymentTerm] : '', midX, rowF, rCW, rH);

        // Row G (full width): terms of delivery — taller for wrapping
        const rowG = cy + rH * 3;
        border(midX, rowG, rCW, termsH);
        label('14. TERMS OF DELIVERY', midX, rowG, rCW);
        if (pi.termsOfDelivery) {
          // Multi-line text: wrap within the cell width, below the label.
          setFont(false, 9);
          doc
            .fillColor(BLUE)
            .text(norm(pi.termsOfDelivery), midX + 4, rowG + 13, {
              width: rCW - 8,
              align: 'center',
            });
        }

        cy += consigneeH + 6;

        // ══════════════════════════════════════════════════════
        // 3. TRANSACTION NOTICE
        // ══════════════════════════════════════════════════════
        setFont(false, 7);
        doc.fillColor(GRAY).text(
          'THE FOLLOWING SIGNING PARTIES AGREE TO MAKE THE TRANSACTION ON THE TERMS AND CONDITIONS STATED BELOW:',
          L,
          cy,
          { width: CW, align: 'center' },
        );
        cy += 14;

        // ══════════════════════════════════════════════════════
        // 4. ITEMS TABLE
        //    Columns: marks | description | hsn | qty | unit price | amount
        //    Widths sum to CW (515). The MARKS column holds a single
        //    "N/M" that spans every item row.
        // ══════════════════════════════════════════════════════
        const TW = [60, 150, 70, 65, 80, 90];
        const TC: number[] = [L];
        for (let i = 1; i < TW.length; i++) TC[i] = TC[i - 1] + TW[i - 1];
        const TH = 22;

        // Header row
        doc.rect(L, cy, CW, TH).fillColor('#F2F2F2').fill();
        border(L, cy, CW, TH);
        for (let c = 1; c < TW.length; c++) {
          doc
            .moveTo(TC[c], cy)
            .lineTo(TC[c], cy + TH)
            .strokeColor(LINE)
            .lineWidth(0.6)
            .stroke();
        }
        const hLabels = [
          "14. MARKS/NO'S.",
          '15. DESCRIPTION OF GOODS',
          'HSN',
          '16. QUANTITY',
          '17. UNIT PRICE',
          '18. AMOUNT',
        ];
        hLabels.forEach((hl, i) => {
          const size = fitSize(hl, TW[i] - 4, true, 7.5, 6);
          doc.fillColor(DARK).text(hl, TC[i] + 2, cy + (TH - size) / 2, {
            width: TW[i] - 4,
            align: 'center',
            lineBreak: false,
          });
        });
        cy += TH;

        // Currency symbol helper
        const currencySymbol: Record<string, string> = {
          USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥',
          AUD: 'A$', CAD: 'C$', CHF: 'CHF', HKD: 'HK$', SGD: 'S$',
          KRW: '₩', INR: '₹', THB: '฿', RUB: '₽', BRL: 'R$',
        };
        const cSym = currencySymbol[pi.currency] || pi.currency;

        const fmtMoney = (n: number) =>
          Number(n).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        const fmtInt = (n: number) => Number(n).toLocaleString('en-US');

        // Padded to at least 5 rows for a clean block even with few items.
        const minRows = 5;
        const totalRows = Math.max(pi.items.length, minRows);

        // MARKS column spans all rows — draw once, then skip its borders
        // in the per-row loop.
        border(TC[0], cy, TW[0], TH * totalRows);
        setFont(false, 10);
        doc.fillColor(DARK).text(
          'N/M',
          TC[0] + 2,
          cy + (TH * totalRows) / 2 - 6,
          { width: TW[0] - 4, align: 'center', lineBreak: false },
        );

        for (let r = 0; r < totalRows; r++) {
          const ry = cy + r * TH;
          const item = pi.items[r];

          // Borders for cols 1..5 (marks col already bordered)
          for (let c = 1; c < TW.length; c++) {
            border(TC[c], ry, TW[c], TH);
          }

          if (!item) continue;

          // Description (centered)
          value(item.productName, TC[1], ry, TW[1], TH, {
            align: 'center',
            baseSize: 9.5,
            hasLabel: false,
          });
          // HSN (centered)
          value(item.hsn || '', TC[2], ry, TW[2], TH, {
            align: 'center',
            baseSize: 9,
            hasLabel: false,
          });
          // Quantity (centered) — include unit if present
          const qtyText = item.unit
            ? `${fmtInt(item.quantity)} ${item.unit}`
            : fmtInt(item.quantity);
          value(qtyText, TC[3], ry, TW[3], TH, {
            align: 'center',
            baseSize: 9,
            hasLabel: false,
          });
          // Unit price (centered) — e.g. "$3.00"
          value(
            `${cSym}${fmtMoney(Number(item.unitPrice))}`,
            TC[4],
            ry,
            TW[4],
            TH,
            { align: 'center', baseSize: 9, hasLabel: false },
          );
          // Amount — $ hugs the left, number the right (per reference)
          const amtY = ry + (TH - 9) / 2;
          setFont(false, 9);
          doc.fillColor(BLUE).text(cSym, TC[5] + 4, amtY, { lineBreak: false });
          const amtText = fmtMoney(Number(item.totalPrice));
          const amtSize = fitSize(amtText, TW[5] - 20, false, 9, 6);
          doc.fillColor(BLUE).text(amtText, TC[5] + 4, ry + (TH - amtSize) / 2, {
            width: TW[5] - 8,
            align: 'right',
            lineBreak: false,
          });
        }

        cy += TH * totalRows;

        // ══════════════════════════════════════════════════════
        // 5. TOTALS BLOCK
        //    Label sits in the DESCRIPTION column area (right-aligned),
        //    $ symbol aligns with the UNIT PRICE column, number aligns
        //    with the AMOUNT column and hugs the right edge.
        // ══════════════════════════════════════════════════════
        const totRows: { lbl: string; val: string | null }[] = [
          { lbl: 'SUBTOTAL', val: fmtMoney(Number(pi.subtotal)) },
          {
            lbl: 'SHIPPING CHARGE',
            val: Number(pi.shippingCharge) > 0 ? fmtMoney(Number(pi.shippingCharge)) : null,
          },
          {
            lbl: 'OTHER',
            val: Number(pi.other) > 0 ? fmtMoney(Number(pi.other)) : null,
          },
          { lbl: 'TOTAL VALUE', val: fmtMoney(Number(pi.totalAmount)) },
        ];

        const dolColX = TC[4];
        const dolColW = TW[4];
        const amtColX = TC[5];
        const amtColW = TW[5];
        // Label right-aligned, spanning the HSN + QTY area right up to
        // the $ column — gives it plenty of room for "SHIPPING CHARGE".
        const totLabelX = TC[2];
        const totLabelW = dolColX - TC[2] - 6;

        totRows.forEach((tr) => {
          const isFinal = tr.lbl === 'TOTAL VALUE';

          // Label (right-aligned, inside the shared column area)
          setFont(isFinal, 8.5);
          doc.fillColor(DARK).text(tr.lbl, totLabelX, cy + (TH - 8.5) / 2, {
            width: totLabelW,
            align: 'right',
            lineBreak: false,
          });

          // $ cell
          border(dolColX, cy, dolColW, TH);
          if (tr.val !== null) {
            setFont(false, 9);
            doc.fillColor(BLUE).text(cSym, dolColX + 4, cy + (TH - 9) / 2, {
              width: dolColW - 8,
              align: 'left',
              lineBreak: false,
            });
          }

          // Amount cell (right-aligned, no shrink needed since it's roomy)
          border(amtColX, cy, amtColW, TH);
          if (tr.val !== null) {
            const size = fitSize(tr.val, amtColW - 8, isFinal, 9, 6);
            doc.fillColor(BLUE).text(tr.val, amtColX + 4, cy + (TH - size) / 2, {
              width: amtColW - 8,
              align: 'right',
              lineBreak: false,
            });
          }
          cy += TH;
        });

        cy += 10;

        // ══════════════════════════════════════════════════════
        // 6. VALIDITY + NOTES
        // ══════════════════════════════════════════════════════
        setFont(false, 9.5);
        doc.fillColor(DARK).text(
          `Validity Period: ${pi.validityPeriod} DAYS`,
          L,
          cy,
        );
        cy = doc.y + 4;

        if (pi.countryOfOrigin) {
          setFont(false, 9.5);
          doc.fillColor(DARK).text(
            `Country of Origin: ${norm(pi.countryOfOrigin)}`,
            L,
            cy,
          );
          cy = doc.y + 4;
        }

        if (pi.notes) {
          setFont(false, 9);
          doc.fillColor(DARK).text(norm(pi.notes), L, cy, { width: CW });
          cy = doc.y + 4;
        }

        // Separator before bank info
        cy += 2;
        doc
          .moveTo(L, cy)
          .lineTo(PW - L, cy)
          .strokeColor(DARK)
          .lineWidth(0.8)
          .stroke();
        cy += 8;

        // ══════════════════════════════════════════════════════
        // 7. BANK INFORMATION
        //    Each line: if it contains ':' or '：', render the label
        //    (including the colon) bold, and the value regular. Else
        //    render the whole line regular.
        // ══════════════════════════════════════════════════════
        if (bankInfo && bankInfo.bankInfoText) {
          const lines = bankInfo.bankInfoText
            .split('\n')
            .map((l: string) => l.replace(/\s+$/, ''))
            .filter((l: string) => l.length > 0);

          const bankBaseSize = 8.5;
          for (const line of lines) {
            if (cy > 790) {
              doc.addPage();
              cy = T;
            }

            // Capture the label without its separator; always render an
            // ASCII ": " after it so the generated PDF looks consistent
            // regardless of whether the user typed an ASCII colon or a
            // full-width Chinese colon "：" (which Helvetica can't render
            // and would otherwise show up as a stray "y" glyph).
            const match = line.match(/^([^:：]+)[:：]\s*(.*)$/);
            if (match && match[2]) {
              const lbl = `${norm(match[1])}:`;
              const val = norm(match[2]);
              setFont(true, bankBaseSize);
              const lblW = doc.widthOfString(lbl + ' ');
              doc.fillColor(DARK).text(lbl, L, cy, { lineBreak: false });
              setFont(false, bankBaseSize);
              doc.fillColor(DARK).text(val, L + lblW, cy, {
                width: CW - lblW,
              });
              cy = doc.y + 1;
            } else {
              // No separator or empty value — render as a plain line.
              setFont(false, bankBaseSize);
              doc.fillColor(DARK).text(norm(line), L, cy, { width: CW });
              cy = doc.y + 1;
            }
          }

          cy += 4;
          doc
            .moveTo(L, cy)
            .lineTo(PW - L, cy)
            .strokeColor(DARK)
            .lineWidth(0.8)
            .stroke();
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
