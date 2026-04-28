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

  /**
   * 找一个能渲染中文的 TTF/TTC 字体并解析出可用的 PostScript 名。
   *
   * 关键点：pdfkit/fontkit 处理 .ttc 字体集合时，第二个参数必须是
   * **PostScript name**（如 `WenQuanYiZenHei` 无空格），用 family
   * name (`WenQuanYi Zen Hei`) 会直接抛 "Not a supported font format"。
   * 所以这里用 fontkit 实际打开一遍，挑一个含 CJK 字符的字体子集，
   * 把它的 PostScript 名读出来给 pdfkit 用。
   *
   * 路径覆盖：
   *   - 环境变量 PI_CJK_FONT（部署 / dev 都可手动指定，最高优先级）
   *   - Alpine（生产容器，apk add font-wqy-zenhei）
   *   - Debian/Ubuntu / 各发行版常见 CJK 字体路径
   *   - macOS dev 兜底
   */
  private static cjkFontCache:
    | { src: string; postscriptName?: string }
    | null
    | undefined;
  private findCJKFont(): { src: string; postscriptName?: string } | null {
    if (PIsService.cjkFontCache !== undefined) return PIsService.cjkFontCache;
    // 项目内自带的 CJK 字体（5MB WQY MicroHei TTC，含所有中日韩简繁字形）。
    // 不论部署环境有没有装系统字体，PDF 生成都能直接用。优先级仅次于
    // PI_CJK_FONT 显式指定，确保按需的话还能换更"好看"的字体。
    const bundled = path.join(process.cwd(), 'assets/fonts/wqy-microhei.ttc');
    const candidates = [
      process.env.PI_CJK_FONT,
      bundled,
      '/usr/share/fonts/wenquanyi/wqy-zenhei/wqy-zenhei.ttc',
      '/usr/share/fonts/wenquanyi/wqy-microhei/wqy-microhei.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
      '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf',
      '/usr/share/fonts/google-noto-cjk-fonts/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
      '/System/Library/Fonts/PingFang.ttc',
      '/System/Library/Fonts/STHeiti Medium.ttc',
      '/System/Library/Fonts/Hiragino Sans GB.ttc',
    ].filter((p): p is string => !!p);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fontkit = require('fontkit');
    const ZH_CHAR = 0x4e2d; // "中"，做 CJK 可用性检测的探测字符

    for (const src of candidates) {
      try {
        if (!fs.existsSync(src)) continue;
        const f = fontkit.openSync(src);
        // TTF：直接是 Font 对象；TTC：有 .fonts 数组
        if (Array.isArray((f as any).fonts)) {
          const cjk =
            (f as any).fonts.find(
              (x: any) =>
                x?.hasGlyphForCodePoint && x.hasGlyphForCodePoint(ZH_CHAR),
            ) || (f as any).fonts[0];
          if (cjk) {
            this.logger.log(
              `Using CJK font: ${src} (PS=${cjk.postscriptName})`,
            );
            PIsService.cjkFontCache = { src, postscriptName: cjk.postscriptName };
            return PIsService.cjkFontCache;
          }
        } else {
          this.logger.log(`Using CJK font: ${src} (TTF, no family)`);
          PIsService.cjkFontCache = { src };
          return PIsService.cjkFontCache;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to inspect CJK font ${src}: ${err?.message || err}`);
      }
    }
    this.logger.warn(
      'No CJK font found. Chinese text in PDFs will fall back to Helvetica and may render as garbage. ' +
        'Install one (e.g. `apk add font-wqy-zenhei` / `apt install fonts-wqy-zenhei`) ' +
        'or set PI_CJK_FONT=/path/to/font.ttf|.ttc.',
    );
    PIsService.cjkFontCache = null;
    return null;
  }

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

        // ── 中文字体注册 ───────────────────────────────────────
        // 注册一份能渲染中文 + 拉丁字符的 CJK 字体（WenQuanYi Zen Hei 等）。
        // 注册成功后所有文本都走这套字体；找不到就退化到 Helvetica，并
        // 用 norm() 把全角中文标点替换成 ASCII，避免出现"y" 替代符。
        //
        // 注册之后立刻 `doc.font('CJK')` 试一下：pdfkit 的 registerFont 只
        // 是登记一个映射，真正的字体加载发生在第一次 doc.font(name)。
        // 用 try/catch 包住这次试探；若加载失败说明 PostScript 名不对、
        // 文件损坏或权限问题，把 cjkOk 设回 false 走 Helvetica 兜底，
        // 避免后续每次画字都抛错。
        const cjk = this.findCJKFont();
        let cjkOk = false;
        if (cjk) {
          try {
            doc.registerFont('CJK', cjk.src, cjk.postscriptName);
            doc.registerFont('CJK-Bold', cjk.src, cjk.postscriptName);
            doc.font('CJK'); // 触发实际加载
            cjkOk = true;
          } catch (err: any) {
            this.logger.warn(
              `Failed to load CJK font from ${cjk.src} (${cjk.postscriptName ?? '<no-ps>'}): ${err?.message || err}`,
            );
          }
        }

        const setFont = (bold: boolean, size: number) => {
          if (cjkOk) {
            doc.font(bold ? 'CJK-Bold' : 'CJK').fontSize(size);
          } else {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
          }
        };

        /**
         * 判断字符串是否只含 Helvetica 能渲染的字符（基本 ASCII +
         * Latin-1 + 常见全/半角西文标点）。纯英文场景统一走 Arial Bold
         * + 黑色，确保 PI 在装了 CJK 字体后不会把英文也"用 CJK 字形"
         * 渲染成异样。
         */
        const isHelveticaSafe = (s: string): boolean => {
          if (!s) return true;
          for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c < 0x100) continue; // ASCII + Latin-1 OK
            return false;
          }
          return true;
        };

        /**
         * 按内容自动选字体（**只用于"用户输入值"**，不用于模板标签）：
         *   - 纯英文（含数字、符号）→ Helvetica（常规，**不加粗**）+ 蓝色
         *   - 含中文 → 走 CJK 字体（常规）+ 蓝色
         * 模板标签（label() / hLabels / 静态英文公告）单独走
         * Helvetica-Bold + 黑色，不调本函数。
         */
        const setSmartFont = (size: number, txt: string) => {
          if (isHelveticaSafe(txt)) {
            doc.font('Helvetica').fontSize(size);
            return { color: BLUE, isLatin: true };
          }
          if (cjkOk) {
            doc.font('CJK').fontSize(size);
          } else {
            doc.font('Helvetica').fontSize(size);
          }
          return { color: BLUE, isLatin: false };
        };

        const border = (x: number, y: number, w: number, h: number) =>
          doc.rect(x, y, w, h).strokeColor(LINE).lineWidth(0.6).stroke();

        /**
         * 全角中文标点 → ASCII。仅在没有 CJK 字体时启用——Helvetica 没有
         * 这些字符的 glyph，留着会变成 "y" 占位符。注册到 CJK 字体后这层
         * 转换不再需要，原样保留中文标点更自然。
         */
        const norm = (s: string | null | undefined): string => {
          if (!s) return '';
          if (cjkOk) return String(s);
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

        /** 标签：cell 左上角的小灰字题号 (e.g. "3. INVOICE NO.")。
         *  标签全是英文，按规范统一 Helvetica-Bold（Arial Bold）+ 黑色。 */
        const label = (txt: string, x: number, y: number, w: number) => {
          doc.font('Helvetica-Bold').fontSize(7.5);
          doc.fillColor(DARK).text(txt, x + 4, y + 3, {
            width: w - 8,
            lineBreak: false,
          });
        };

        /**
         * Cell 内部的居中值。按内容自动选字体 / 颜色：
         *   - 纯英文 / 数字 / 符号 → Helvetica-Bold + 黑色
         *   - 含中文 → CJK 字体 + 蓝色（保持原视觉）
         * 自动缩小字号以避免溢出；align='right' 用于金额列。
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
          const meta = setSmartFont(baseSize, safe);
          // 缩小到 fit；保持 setSmartFont 选定的字体（值始终是 Helvetica
          // 常规 / CJK 常规，不加粗）。
          let size = baseSize;
          while (doc.widthOfString(safe) > w - 8 && size > 6) {
            size -= 1;
            if (meta.isLatin) {
              doc.font('Helvetica').fontSize(size);
            } else {
              doc.font(cjkOk ? 'CJK' : 'Helvetica').fontSize(size);
            }
          }
          const reservedTop = hasLabel ? LABEL_HEIGHT : 0;
          const yOff = reservedTop + (h - reservedTop - size) / 2;
          doc.fillColor(meta.color).text(safe, x + 4, y + yOff, {
            width: w - 8,
            align,
            lineBreak: false,
          });
        };

        /** Multi-line left-aligned value (seller/consignee blocks)：
         *  地址 / 公司名常常中英混排，用 setSmartFont 按内容自动选。
         *  纯英文走 Arial Bold + 黑；含中文走 CJK + 蓝。 */
        const valueBlock = (
          txt: string,
          x: number,
          y: number,
          w: number,
          baseSize = 9,
        ) => {
          const safe = norm(txt);
          if (!safe) return y;
          const meta = setSmartFont(baseSize, safe);
          doc.fillColor(meta.color).text(safe, x + 4, y, { width: w - 8 });
          return doc.y;
        };

        let cy = T;

        // ══════════════════════════════════════════════════════
        // 1. TITLE + LOGO ROW
        //    - 标题 "Proforma Invoice"：Helvetica-Bold（pdfkit 内置，
        //      Arial-Bold 等价）20pt 黑色，水平居中在整页宽度内
        //    - 公司 Logo：高度 11mm（A4 上 ≈ 31pt），宽度按图片实际宽
        //      高比等比缩放，置于页面右上角
        //    - 标题与 logo 底部基线对齐 —— 视觉上"左标题居中 + 右
        //      logo"且两者基准线齐平
        // ══════════════════════════════════════════════════════
        const titleFontSize = 20;
        const titleStr = 'Proforma Invoice';
        const MM_TO_PT = 2.83465;
        const logoH = Math.round(11 * MM_TO_PT); // 11mm → 31pt
        const titleH = Math.max(logoH, titleFontSize * 1.2) + 22;

        // 标题用 Helvetica-Bold（不走 CJK 字体）保证"Arial Bold"的字形
        // 一致性——这一段全是拉丁字母，无所谓 CJK。
        doc.font('Helvetica-Bold').fontSize(titleFontSize);
        const titleTextH = doc.currentLineHeight(true);
        // 让 title 和 logo 的底部都对齐到 sharedBottomY（视觉基线）。
        const sharedBottomY = cy + titleH - 12;
        const titleY = sharedBottomY - titleTextH;

        doc.fillColor(DARK).text(titleStr, L, titleY, {
          width: CW,
          align: 'center',
          lineBreak: false,
        });

        if (logoUrl) {
          const absPath = path.join(process.cwd(), logoUrl.replace(/^\//, ''));
          if (fs.existsSync(absPath)) {
            try {
              const img: any = (doc as any).openImage(absPath);
              if (img && img.width && img.height) {
                const logoW = (logoH / img.height) * img.width;
                doc.image(img, PW - L - logoW, sharedBottomY - logoH, {
                  width: logoW,
                  height: logoH,
                });
              }
            } catch (err: any) {
              this.logger.warn(`openImage failed: ${err?.message || err}`);
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
        // 3. TRANSACTION NOTICE — 英文公告，强制 Helvetica-Bold + 黑色
        // ══════════════════════════════════════════════════════
        doc.font('Helvetica-Bold').fontSize(7);
        doc.fillColor(DARK).text(
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
        // 表头全是英文，强制 Helvetica-Bold + 黑色（不走 CJK 字体）
        hLabels.forEach((hl, i) => {
          let size = 7.5;
          doc.font('Helvetica-Bold').fontSize(size);
          while (doc.widthOfString(hl) > TW[i] - 4 && size > 6) {
            size -= 1;
            doc.fontSize(size);
          }
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
        doc.font('Helvetica-Bold').fontSize(10);
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
          // Amount —— "$3.00" 这种货币 + 数字组合作为单字符串水平居中，
          // 与底部 SUBTOTAL/TOTAL VALUE 一致；用户输入值 → Helvetica + 蓝色。
          const amtText = `${cSym}${fmtMoney(Number(item.totalPrice))}`;
          let amtFs = 9;
          doc.font('Helvetica').fontSize(amtFs);
          while (doc.widthOfString(amtText) > TW[5] - 8 && amtFs > 6) {
            amtFs -= 1;
            doc.fontSize(amtFs);
          }
          doc.fillColor(BLUE).text(amtText, TC[5] + 4, ry + (TH - amtFs) / 2, {
            width: TW[5] - 8,
            align: 'center',
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
        // 底部金额：标准 2 列带边框表格。每行两个相邻单元格，
        //   - 标签列：水平居中、垂直居中
        //   - 金额列：货币 + 数字组合后整体右对齐，垂直居中
        //   - 内边距 PAD=6 让文字不贴边
        // 整体右对齐到与"AMOUNT"列同一右缘。
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

        // 标签列 = UNIT_PRICE 列宽（单列），金额列 = AMOUNT 列宽（单列），
        // 整个底部金额块只占货物表右侧两列（不再跨 QTY+UNIT_PRICE 两列）。
        const totLabelX = TC[4];
        const totLabelW = TW[4];   // 80
        const totAmtX = TC[5];
        const totAmtW = TW[5];     // 90
        const PAD = 6;

        totRows.forEach((tr) => {
          const isFinal = tr.lbl === 'TOTAL VALUE';

          // 标签 cell：模板文字，Helvetica-Bold + 黑、水平/垂直居中
          // 字号 7.5 与上方货物表表头（hLabels）保持一致；过宽自动缩到 6
          border(totLabelX, cy, totLabelW, TH);
          let lblFs = 7.5;
          doc.font('Helvetica-Bold').fontSize(lblFs);
          while (doc.widthOfString(tr.lbl) > totLabelW - PAD * 2 && lblFs > 6) {
            lblFs -= 0.5;
            doc.fontSize(lblFs);
          }
          doc.fillColor(DARK).text(
            tr.lbl,
            totLabelX + PAD,
            cy + (TH - lblFs) / 2,
            {
              width: totLabelW - PAD * 2,
              align: 'center',
              lineBreak: false,
            },
          );

          // 金额 cell：用户输入值 → Helvetica 常规 + 蓝色，水平居中对齐。
          // 字号与货物行金额一致（9），TOTAL VALUE 不再特别放大，整张
          // 表上下字号统一。
          border(totAmtX, cy, totAmtW, TH);
          if (tr.val !== null) {
            const display = `${cSym}${tr.val}`; // 例如 "$240.00" / "€240.00"
            let fs = 9;
            doc.font('Helvetica').fontSize(fs);
            while (doc.widthOfString(display) > totAmtW - PAD * 2 && fs > 6) {
              fs -= 1;
              doc.fontSize(fs);
            }
            doc.fillColor(BLUE).text(
              display,
              totAmtX + PAD,
              cy + (TH - fs) / 2,
              {
                width: totAmtW - PAD * 2,
                align: 'center',
                lineBreak: false,
              },
            );
          }
          cy += TH;
          // isFinal 不再用，保留变量名提醒后续若想给 TOTAL VALUE 单独样式
          void isFinal;
        });

        cy += 10;

        // ══════════════════════════════════════════════════════
        // 6. VALIDITY + NOTES
        // ══════════════════════════════════════════════════════
        // Validity / Country of Origin 都是英文，统一 Helvetica-Bold + 黑色
        doc.font('Helvetica-Bold').fontSize(9.5);
        doc.fillColor(DARK).text(
          `Validity Period: ${pi.validityPeriod} DAYS`,
          L,
          cy,
        );
        cy = doc.y + 4;

        if (pi.countryOfOrigin) {
          // "Country of Origin: " 是英文前缀；值若是中文（罕见）会带不同
          // 字体——这里整体按英文处理，常见值如 "China" / "Vietnam" 都没问题
          doc.font('Helvetica-Bold').fontSize(9.5);
          doc.fillColor(DARK).text(
            `Country of Origin: ${norm(pi.countryOfOrigin)}`,
            L,
            cy,
          );
          cy = doc.y + 4;
        }

        if (pi.notes) {
          // 备注可能含中文，按内容自动选字体
          const notesTxt = norm(pi.notes);
          const meta = setSmartFont(9, notesTxt);
          doc.fillColor(meta.color).text(notesTxt, L, cy, { width: CW });
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
              // 标签全是英文，强制 Helvetica-Bold + 黑
              doc.font('Helvetica-Bold').fontSize(bankBaseSize);
              const lblW = doc.widthOfString(lbl + ' ');
              doc.fillColor(DARK).text(lbl, L, cy, { lineBreak: false });
              // 值按内容选字体：英文走 Helvetica-Bold，中文走 CJK
              setSmartFont(bankBaseSize, val);
              doc.fillColor(DARK).text(val, L + lblW, cy, {
                width: CW - lblW,
              });
              cy = doc.y + 1;
            } else {
              // No separator or empty value — render as a plain line.
              const plain = norm(line);
              setSmartFont(bankBaseSize, plain);
              doc.fillColor(DARK).text(plain, L, cy, { width: CW });
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
