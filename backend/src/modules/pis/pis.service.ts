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
    if (dto.countryOfOrigin !== undefined) updateData.countryOfOrigin = dto.countryOfOrigin;
    if (dto.termsOfDelivery !== undefined) updateData.termsOfDelivery = dto.termsOfDelivery;
    if (dto.notes !== undefined) updateData.notes = dto.notes;
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

    if (role !== 'ADMIN' && pi.status !== 'APPROVED') {
      throw new ForbiddenException('Cannot generate PDF for unapproved PIs');
    }

    const [bankInfo, logoUrl] = await Promise.all([
      this.settingsService.getBankInfo(),
      this.settingsService.getLogoUrl(),
    ]);

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 0 });
        const buffers: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        // ── Layout constants ────────────────────────────────────
        const L = 35;          // left margin
        const T = 30;          // top margin
        const PW = 595;        // page width (A4)
        const CW = PW - L * 2; // content width = 525
        const leftColW = 218;  // seller / consignee column
        const rCW = CW - leftColW; // right section width = 307
        const rHalfW = rCW / 2;    // each right sub-column = 153.5
        const midX = L + leftColW;
        const rH = 30;         // info-grid row height
        const BLUE = '#1155CC';
        const DARK = '#222222';
        const GRAY = '#666666';
        const LINE = '#AAAAAA';
        const TABLE_STRIPE = '#F5F5F5';

        // ── Font helper ─────────────────────────────────────────
        const setFont = (bold: boolean, size: number) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
        };

        // ── Draw a bordered cell ─────────────────────────────────
        const border = (x: number, y: number, w: number, h: number) =>
          doc.rect(x, y, w, h).strokeColor(LINE).lineWidth(0.5).stroke();

        // ── Label (top-left inside cell) ─────────────────────────
        const label = (txt: string, x: number, y: number, w: number) => {
          setFont(false, 7);
          doc.fillColor(DARK).text(txt, x + 3, y + 3, { width: w - 6, lineBreak: false });
        };

        // ── Centered blue value inside cell ──────────────────────
        const value = (txt: string, x: number, y: number, w: number, h: number) => {
          if (!txt) return;
          setFont(false, 9);
          doc.fillColor(BLUE).text(txt, x + 4, y + 14, {
            width: w - 8, align: 'center', lineBreak: false,
          });
        };

        // ── Left-aligned blue value (for multi-line cells) ───────
        const valueLeft = (txt: string, x: number, y: number, w: number) => {
          if (!txt) return;
          setFont(false, 9);
          doc.fillColor(BLUE).text(txt, x + 4, y + 13, { width: w - 8 });
        };

        let cy = T;

        // ════════════════════════════════════════════════════════
        // 1.  PAGE HEADER  "PAGE 1/1"
        // ════════════════════════════════════════════════════════
        setFont(false, 8);
        doc.fillColor(GRAY).text('PAGE 1/1', 0, T, { width: PW - 20, align: 'right' });
        cy += 18;

        // ════════════════════════════════════════════════════════
        // 2.  TITLE ROW  "Proforma Invoice"  +  logo top-right
        // ════════════════════════════════════════════════════════
        setFont(true, 20);
        doc.fillColor(DARK).text('Proforma Invoice', L, cy, { width: CW * 0.55 });

        // Logo (top-right of title row)
        if (logoUrl) {
          const absPath = path.join(process.cwd(), logoUrl.replace(/^\//, ''));
          if (fs.existsSync(absPath)) {
            try {
              doc.image(absPath, PW - L - 110, cy - 4, { fit: [108, 46] });
            } catch { /* skip bad image */ }
          }
        }

        cy += 38;
        // thin rule under title
        doc.moveTo(L, cy).lineTo(PW - L, cy).strokeColor(LINE).lineWidth(0.5).stroke();
        cy += 1;

        // ════════════════════════════════════════════════════════
        // 3.  INFO GRID
        // ════════════════════════════════════════════════════════

        // ── Seller block  (left col, 3 rows) ────────────────────
        const sellerH = rH * 3;
        border(L, cy, leftColW, sellerH);
        label('1. SELLER / EXPORTER', L, cy, leftColW);
        valueLeft(pi.sellerId || '', L, cy, leftColW);
        // address below name
        if (pi.sellerAddress) {
          const afterName = doc.y;
          setFont(false, 8);
          doc.fillColor(BLUE).text(pi.sellerAddress, L + 4, afterName, { width: leftColW - 8 });
        }

        // Row A right: INVOICE NO + DATE
        border(midX, cy, rHalfW, rH);
        label('3. INVOICE NO.', midX, cy, rHalfW);
        value(pi.piNo, midX, cy, rHalfW, rH);

        border(midX + rHalfW, cy, rHalfW, rH);
        label('4. DATE', midX + rHalfW, cy, rHalfW);
        const dateOpts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        value(pi.createdAt.toLocaleDateString('en-US', dateOpts), midX + rHalfW, cy, rHalfW, rH);

        // Row B right: PO NO + CURRENCY
        border(midX, cy + rH, rHalfW, rH);
        label('5. PO NO.', midX, cy + rH, rHalfW);
        value(pi.poNo || '', midX, cy + rH, rHalfW, rH);

        border(midX + rHalfW, cy + rH, rHalfW, rH);
        label('6. CURRENCY', midX + rHalfW, cy + rH, rHalfW);
        value(pi.currency, midX + rHalfW, cy + rH, rHalfW, rH);

        // Row C right: SHIPPING METHOD + PORT OF LOADING
        border(midX, cy + rH * 2, rHalfW, rH);
        label('7. SHIPPING METHOD', midX, cy + rH * 2, rHalfW);
        value(pi.shippingMethod || '', midX, cy + rH * 2, rHalfW, rH);

        border(midX + rHalfW, cy + rH * 2, rHalfW, rH);
        label('8. PORT OF LOADING', midX + rHalfW, cy + rH * 2, rHalfW);
        value(pi.portOfLoading || '', midX + rHalfW, cy + rH * 2, rHalfW, rH);

        cy += sellerH;

        // ── Consignee block  (left col, 4 rows including TERMS OF DELIVERY) ──
        const consigneeH = rH * 4;
        border(L, cy, leftColW, consigneeH);
        label('2. CONSIGNEE AND ADDRESS', L, cy, leftColW);
        valueLeft(pi.consigneeName || '', L, cy, leftColW);
        if (pi.consigneeAddress) {
          const afterName2 = doc.y;
          setFont(false, 8);
          doc.fillColor(BLUE).text(pi.consigneeAddress, L + 4, afterName2, { width: leftColW - 8 });
        }

        // Row D right: PORT OF DISCHARGE + PLACE OF DELIVERY
        border(midX, cy, rHalfW, rH);
        label('9. PORT OF DISCHARGE', midX, cy, rHalfW);
        value(pi.portOfDischarge || '', midX, cy, rHalfW, rH);

        border(midX + rHalfW, cy, rHalfW, rH);
        label('10. PLACE OF DELIVERY', midX + rHalfW, cy, rHalfW);
        value(pi.placeOfDelivery || '', midX + rHalfW, cy, rHalfW, rH);

        // Row E right: PAYMENT METHOD + TRADE TERM
        border(midX, cy + rH, rHalfW, rH);
        label('11. PAYMENT METHOD', midX, cy + rH, rHalfW);
        value(pi.paymentMethod || '', midX, cy + rH, rHalfW, rH);

        border(midX + rHalfW, cy + rH, rHalfW, rH);
        label('12. TRADE TERM:', midX + rHalfW, cy + rH, rHalfW);
        value(pi.tradeTerm || '', midX + rHalfW, cy + rH, rHalfW, rH);

        // Row F right: Country of Origin + PAYMENT TERM
        border(midX, cy + rH * 2, rHalfW, rH);
        label('13. Country of Origin', midX, cy + rH * 2, rHalfW);
        value(pi.countryOfOrigin || '', midX, cy + rH * 2, rHalfW, rH);

        border(midX + rHalfW, cy + rH * 2, rHalfW, rH);
        label('13. PAYMENT TERM', midX + rHalfW, cy + rH * 2, rHalfW);
        const ptMap: Record<string, string> = {
          T_30: '30% Advance', T_50: '50% Advance',
          T_70: '70% Advance', T_100: '100% Advance',
        };
        value(pi.paymentTerm ? ptMap[pi.paymentTerm] : '', midX + rHalfW, cy + rH * 2, rHalfW, rH);

        // Row G right (4th row of consignee block): TERMS OF DELIVERY — spans both right sub-columns
        border(midX, cy + rH * 3, rCW, rH);
        label('14. TERMS OF DELIVERY', midX, cy + rH * 3, rCW);
        value(pi.termsOfDelivery || '', midX, cy + rH * 3, rCW, rH);

        cy += consigneeH + 6;

        // ════════════════════════════════════════════════════════
        // 4.  TRANSACTION NOTICE
        // ════════════════════════════════════════════════════════
        setFont(false, 7);
        doc.fillColor(GRAY).text(
          'THE FOLLOWING SIGNING PARTIES AGREE TO MAKE THE TRANSACTION ON THE TERMS AND CONDITIONS STATED BELOW:',
          L, cy, { width: CW, align: 'center' },
        );
        cy += 14;

        // ════════════════════════════════════════════════════════
        // 5.  ITEMS TABLE
        // ════════════════════════════════════════════════════════
        // Column x-positions and widths (total = CW = 525)
        //  0: MARKS  50   1: DESC  165   2: HSN 50  3: QTY 60  4: PRICE 90  5: AMT 110
        const TC = [L, L+50, L+215, L+265, L+325, L+415]; // col starts
        const TW = [50, 165, 50, 60, 90, 110];              // col widths
        const TH = 20; // item row height

        // Header row
        doc.rect(TC[0], cy, CW, TH).fill(TABLE_STRIPE);
        border(TC[0], cy, CW, TH);
        // vertical dividers in header
        for (let c = 1; c < 6; c++) {
          doc.moveTo(TC[c], cy).lineTo(TC[c], cy + TH).strokeColor(LINE).lineWidth(0.5).stroke();
        }
        const hLabels = [
          '15. MARKS/NO\'S.', '16. DESCRIPTION OF GOODS', '17.HSN',
          '18. QUANTITY', '19. UNIT PRICE', '20. AMOUNT',
        ];
        setFont(true, 7.5);
        doc.fillColor(DARK);
        hLabels.forEach((hl, i) => {
          doc.text(hl, TC[i] + 2, cy + 6, { width: TW[i] - 4, align: 'center', lineBreak: false });
        });
        cy += TH;

        // Item rows — show actual items then pad to at least 5 rows
        const minRows = 5;
        const totalRows = Math.max(pi.items.length, minRows);

        // MARKS / N/M — spans all item rows in col 0
        border(TC[0], cy, TW[0], TH * totalRows);
        setFont(false, 9);
        doc.fillColor(DARK).text('N/M', TC[0] + 2, cy + TH * totalRows / 2 - 6, {
          width: TW[0] - 4, align: 'center', lineBreak: false,
        });

        for (let r = 0; r < totalRows; r++) {
          const ry = cy + r * TH;
          const item = pi.items[r];

          // Draw col borders for cols 1-5
          for (let c = 1; c < 6; c++) {
            border(TC[c], ry, TW[c], TH);
          }

          if (item) {
            // Description
            setFont(false, 9);
            doc.fillColor(BLUE).text(item.productName, TC[1] + 3, ry + 5, {
              width: TW[1] - 6, lineBreak: false,
            });

            // HSN
            setFont(false, 8.5);
            doc.fillColor(BLUE).text(item.hsn || '', TC[2] + 2, ry + 6, {
              width: TW[2] - 4, align: 'center', lineBreak: false,
            });

            // Qty  e.g. "10 PCS"
            const qtyText = `${item.quantity} ${item.unit || 'PCS'}`;
            doc.text(qtyText, TC[3] + 2, ry + 6, {
              width: TW[3] - 4, align: 'center', lineBreak: false,
            });

            // Unit price  "$4.50"
            doc.text(`$${Number(item.unitPrice).toFixed(2)}`, TC[4] + 2, ry + 6, {
              width: TW[4] - 4, align: 'center', lineBreak: false,
            });

            // Amount  "$ 45.00" (dollar sign left, amount right-ish)
            doc.text('$', TC[5] + 4, ry + 6, { lineBreak: false });
            doc.text(Number(item.totalPrice).toFixed(2), TC[5] + 4, ry + 6, {
              width: TW[5] - 8, align: 'right', lineBreak: false,
            });
          }
        }

        cy += TH * totalRows;

        // ── Totals block ─────────────────────────────────────────
        // Cols 0-3 merged (no border); cols 4-5 bordered
        const totRows: { lbl: string; val: string | null }[] = [
          { lbl: 'SUBTOTAL',        val: Number(pi.subtotal).toFixed(2) },
          { lbl: 'SHIPPING CHARGE', val: Number(pi.shippingCharge) > 0 ? Number(pi.shippingCharge).toFixed(2) : null },
          { lbl: 'OTHER',           val: Number(pi.other) > 0 ? Number(pi.other).toFixed(2) : null },
          { lbl: 'TOTAL VALUE',     val: Number(pi.totalAmount).toFixed(2) },
        ];

        const lblColX = TC[3] + TW[3]; // x of the "label" column for totals
        const lblColW = TC[4] + TW[4] - lblColX; // but the image shows label IS col4
        const amtColX = TC[5];
        const amtColW = TW[5];
        const dolColW = 14;

        totRows.forEach((tr) => {
          const isTotalValue = tr.lbl === 'TOTAL VALUE';
          const trH = TH;

          // Label text only (no border on left region)
          setFont(isTotalValue, 8.5);
          doc.fillColor(DARK).text(tr.lbl, TC[4] - 110, cy + trH / 2 - 5, {
            width: 100, align: 'right', lineBreak: false,
          });

          // Dollar sign cell (narrow)
          border(TC[4], cy, dolColW, trH);
          if (tr.val !== null) {
            setFont(false, 9);
            doc.fillColor(BLUE).text('$', TC[4] + 2, cy + trH / 2 - 5, {
              width: dolColW - 4, align: 'center', lineBreak: false,
            });
          }

          // Amount cell
          border(TC[4] + dolColW, cy, amtColW - dolColW, trH);
          if (tr.val !== null) {
            setFont(isTotalValue, 9);
            doc.fillColor(BLUE).text(tr.val, TC[4] + dolColW + 2, cy + trH / 2 - 5, {
              width: amtColW - dolColW - 4, align: 'right', lineBreak: false,
            });
          }
          cy += trH;
        });

        cy += 8;

        // ════════════════════════════════════════════════════════
        // 6.  FOOTER TEXT
        // ════════════════════════════════════════════════════════
        setFont(false, 9);
        doc.fillColor(DARK).text(`Validity Period: ${pi.validityPeriod} DAYS`, L, cy);
        cy += 14;

        if (pi.notes) {
          setFont(false, 9);
          doc.fillColor(DARK).text(pi.notes, L, cy, { width: CW });
          cy = doc.y + 4;
        }

        // separator line
        cy += 2;
        doc.moveTo(L, cy).lineTo(PW - L, cy).strokeColor(DARK).lineWidth(0.8).stroke();
        cy += 8;

        // ════════════════════════════════════════════════════════
        // 7.  BANK INFORMATION
        // ════════════════════════════════════════════════════════
        if (bankInfo) {
          const bankLines: string[] = [];
          if (bankInfo.accountNumber) bankLines.push(`Account number：${bankInfo.accountNumber}`);
          if (bankInfo.holderName)    bankLines.push(`Account name：${bankInfo.holderName}`);
          if (bankInfo.swiftBic)      bankLines.push(`SWIFT/BIC code：${bankInfo.swiftBic}`);
          if (bankInfo.routingNumber) bankLines.push(`Routing Number：${bankInfo.routingNumber}`);
          if (bankInfo.bankName)      bankLines.push(`Bank name：${bankInfo.bankName}`);
          if (bankInfo.country)       bankLines.push(`Country/region：${bankInfo.country}`);
          if (bankInfo.bankAddress)   bankLines.push(`Bank address：${bankInfo.bankAddress}`);
          if (bankInfo.accountType)   bankLines.push(`Account type：${bankInfo.accountType}`);
          if (bankInfo.currency)      bankLines.push(`Payment method：For the payment of goods, please make a ${bankInfo.currency} Payment`);
          if (bankInfo.paymentMemo)   bankLines.push(`Notes：${bankInfo.paymentMemo}`);

          setFont(true, 8.5);
          doc.fillColor(DARK);
          bankLines.forEach((line) => {
            if (cy > 800) { doc.addPage(); cy = T; }
            doc.text(line, L, cy, { width: CW });
            cy = doc.y + 1;
          });

          // bottom separator
          cy += 4;
          doc.moveTo(L, cy).lineTo(PW - L, cy).strokeColor(DARK).lineWidth(0.8).stroke();
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
