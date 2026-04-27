/**
 * PI PDF 解析器：从 Proforma Invoice 的 PDF 文本里抽出订单要素。
 *
 * 主要面向本系统生成的 PI（标签固定为 "INVOICE NO." / "PO NO." /
 * "DESCRIPTION OF GOODS" 等），但也对常见的第三方 PI 做了关键字兜底，
 * 以便老订单的批量导入。
 *
 * 设计原则：
 *  - 尽力而为（best-effort）：解析失败的字段返回 null / 空数组，让前端
 *    把字段做成可编辑的预览表单，由用户确认后再创建订单。
 *  - 不抛异常：除非 PDF 完全无法解析。
 */

// pdf-parse 没有 types，运行时 CommonJS 引入即可。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

export interface ParsedPiItem {
  productName: string;
  description?: string;
  hsn?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface ParsedPi {
  piNo: string | null;
  poNo: string | null;
  date: string | null;        // ISO yyyy-mm-dd 或原文
  currency: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  shippingMethod: string | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  placeOfDelivery: string | null;
  paymentTerm: string | null;
  countryOfOrigin: string | null;
  termsOfDelivery: string | null;
  notes: string | null;
  subtotal: number | null;
  shippingCharge: number | null;
  other: number | null;
  totalAmount: number | null;
  items: ParsedPiItem[];
  /** 原始抽取出的文本，方便前端回退展示 / 调试 */
  rawText: string;
}

const CURRENCY_CODES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'AUD', 'CAD', 'CHF',
  'SGD', 'KRW', 'INR', 'THB', 'RUB', 'BRL', 'MXN', 'NZD',
];
const CURRENCY_SYMBOL_TO_CODE: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'CNY',
  '₩': 'KRW',
  '₹': 'INR',
  '฿': 'THB',
  '₽': 'RUB',
};

/** 把"$1,234.56"或"1,234.56"或"1.234,56"转 number。失败返回 NaN。 */
function parseAmount(raw: string | null | undefined): number {
  if (!raw) return NaN;
  // 去掉货币符号 / 字母前缀（USD/$/€等），保留数字、点、逗号、负号
  const s = String(raw).replace(/[A-Za-z$€£¥₩₹฿₽\s]/g, '').trim();
  if (!s) return NaN;
  // 同时含 "," 和 ".":判断哪个是小数点
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // 欧式 "1.234,56"
      return Number(s.replace(/\./g, '').replace(',', '.'));
    }
    // 英式 "1,234.56"
    return Number(s.replace(/,/g, ''));
  }
  // 只含 ","：假定为千分位
  if (s.includes(',') && !s.includes('.')) {
    return Number(s.replace(/,/g, ''));
  }
  return Number(s);
}

/** 找到字符串里第一个货币 code 或符号，返回三字代码。 */
function detectCurrency(text: string): string | null {
  for (const code of CURRENCY_CODES) {
    const re = new RegExp(`\\b${code}\\b`);
    if (re.test(text)) return code;
  }
  for (const [sym, code] of Object.entries(CURRENCY_SYMBOL_TO_CODE)) {
    if (text.includes(sym)) return code;
  }
  return null;
}

/**
 * 在 lines 里找出 label 的下一行非空内容；用于本系统 PI 这种"标签在上、
 * 值在下"的两行式布局。匹配 label 大小写不敏感、忽略前缀编号 ("3.")。
 */
function valueAfterLabel(lines: string[], labels: string[]): string | null {
  const norm = (s: string) =>
    s
      .replace(/^\s*\d+\.\s*/, '')
      .replace(/[:：]\s*$/, '')
      .trim()
      .toLowerCase();

  const wanted = labels.map((l) => l.toLowerCase());
  for (let i = 0; i < lines.length; i++) {
    const cur = norm(lines[i]);
    if (!wanted.includes(cur)) continue;
    // 取下一条非空行
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const v = lines[j].trim();
      if (v) return v;
    }
  }
  return null;
}

/**
 * "标签 值"同一行的常见格式："PO NO.: ABC-123"、"Currency: USD"。
 * 匹配 label，从行内冒号后或紧跟着的非空格内容取值。
 */
function valueOnSameLine(lines: string[], labels: string[]): string | null {
  for (const line of lines) {
    for (const label of labels) {
      const re = new RegExp(`${escapeRe(label)}\\s*[:：]?\\s*(.+)$`, 'i');
      const m = line.match(re);
      if (m) {
        const v = m[1]
          .replace(/^[#\-:：]+\s*/, '')
          .trim();
        if (v) return v;
      }
    }
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 提取 items 表格。先定位到"DESCRIPTION OF GOODS"附近的表头之后、
 * "Subtotal" / "Total Amount" / "Grand Total" 等总计前。在这个区间里
 * 用 "QTY UNITPRICE TOTAL" 三连数字模式切割行。
 *
 * 复杂格式（合并单元格、跨行描述）做不到 100% 准确，但能给前端一个
 * 大致预览；前端表格允许编辑。
 */
function extractItems(rawText: string, currency: string | null): ParsedPiItem[] {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // 找 items 区段的起止
  const startIdx = lines.findIndex((l) =>
    /AMOUNT|UNIT\s*PRICE|DESCRIPTION OF GOODS/i.test(l),
  );
  if (startIdx === -1) return [];

  const endIdx = lines.findIndex((l, i) => {
    if (i <= startIdx) return false;
    return /^(sub\s*total|grand\s*total|total\s*amount|total\s*:|合计|总计)/i.test(l);
  });

  const region = lines.slice(
    startIdx + 1,
    endIdx === -1 ? Math.min(lines.length, startIdx + 200) : endIdx,
  );

  const items: ParsedPiItem[] = [];
  // pdf-parse 出来的行，行末通常是金额、行首是描述。
  // 最稳的特征是行尾带连续的两 / 三个数字（qty + unit price + total）。
  // 形如："Product Name    HSN    100 PCS    $5.00    $500.00"
  // 但 pdf-parse 经常会拆成多行，我们按"含金额数字"行作为锚点收集。
  const moneyRe = /[$€£¥₩₹฿₽]?\s*([\d.,]+)/g;

  // 缓冲非数字描述行，遇到金额行时合并提交
  let descBuf: string[] = [];
  for (const line of region) {
    // 跳过明显的非 item 行
    if (/^(N\/M|MARKS|HSN|PCS|UNIT|TOTAL|page|续|共|本|PI No)/i.test(line)) {
      continue;
    }

    // 尝试在行尾抓 3~4 个数字（qty + unit price + total，可选 hsn 数字）
    const numbers: number[] = [];
    let m: RegExpExecArray | null;
    moneyRe.lastIndex = 0;
    while ((m = moneyRe.exec(line)) !== null) {
      const n = parseAmount(m[1]);
      if (Number.isFinite(n)) numbers.push(n);
    }

    if (numbers.length >= 3) {
      // 这一行像是 item 数据行
      const total = numbers[numbers.length - 1];
      const unitPrice = numbers[numbers.length - 2];
      const qtyCandidate = numbers[numbers.length - 3];
      // qty 必须是正整数
      const qty = Number.isInteger(qtyCandidate) && qtyCandidate > 0
        ? qtyCandidate
        : Math.round(qtyCandidate);

      // 一致性校验：如果 unitPrice * qty 与 total 偏差 > 5%，丢弃
      const expected = unitPrice * qty;
      const ratio = expected > 0 ? Math.abs(expected - total) / expected : 0;
      if (ratio > 0.05 && Math.abs(expected - total) > 1) {
        descBuf.push(line);
        continue;
      }

      // 描述：当前行去掉这三个数字 + 之前 buffer
      let desc = line.replace(moneyRe, '').replace(/\bPCS\b/i, '').trim();
      if (descBuf.length > 0) {
        desc = [descBuf.join(' '), desc].filter(Boolean).join(' ').trim();
      }
      descBuf = [];

      if (desc) {
        items.push({
          productName: desc,
          quantity: qty,
          unitPrice,
          totalPrice: total,
        });
      }
    } else {
      // 描述续行，缓冲
      descBuf.push(line);
    }

    // 弃用 currency 仅用于将来在描述里去除货币符号
    void currency;
  }

  return items;
}

export async function parsePiPdf(buffer: Buffer): Promise<ParsedPi> {
  const result = await pdfParse(buffer);
  const rawText: string = String(result?.text || '');
  const lines = rawText
    .split('\n')
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter(Boolean);

  // ---- 标签 → 值 ----
  const piNo =
    valueAfterLabel(lines, ['INVOICE NO.', 'INVOICE NO', 'PI NO.', 'PI NO', 'PI #', 'Proforma Invoice No']) ||
    valueOnSameLine(lines, ['INVOICE NO.', 'INVOICE NO', 'PI NO.', 'PI NO', 'PI #', 'Proforma Invoice No']);

  const poNo =
    valueAfterLabel(lines, ['PO NO.', 'PO NO', 'PO #', 'Purchase Order No', 'Purchase Order']) ||
    valueOnSameLine(lines, ['PO NO.', 'PO NO', 'PO #', 'Purchase Order No', 'Purchase Order']);

  const date =
    valueAfterLabel(lines, ['DATE', 'Invoice Date', 'PI Date']) ||
    valueOnSameLine(lines, ['DATE', 'Invoice Date', 'PI Date']);

  const currencyByLabel =
    valueAfterLabel(lines, ['CURRENCY']) || valueOnSameLine(lines, ['CURRENCY']);
  const currency = (currencyByLabel && CURRENCY_CODES.find((c) => currencyByLabel.toUpperCase().includes(c))) ||
    detectCurrency(rawText);

  // 收件人：先找标签下面的 N 行直到下一个标签
  const consigneeName = valueAfterLabel(lines, ['CONSIGNEE AND ADDRESS', 'CONSIGNEE', 'BILL TO', 'SHIP TO']);
  // 收件地址：从 consigneeName 那一行往下，多收 2~4 行作为地址
  let consigneeAddress: string | null = null;
  if (consigneeName) {
    const idx = lines.indexOf(consigneeName);
    if (idx !== -1) {
      const tail: string[] = [];
      for (let j = idx + 1; j < Math.min(idx + 5, lines.length); j++) {
        const l = lines[j];
        // 遇到下一个编号标签停止
        if (/^\d+\.\s/.test(l)) break;
        if (/^(INVOICE|DATE|PO|CURRENCY|SHIPPING|PORT|PAYMENT|TERMS|COUNTRY|MARKS|DESCRIPTION)/i.test(l))
          break;
        tail.push(l);
      }
      consigneeAddress = tail.length > 0 ? tail.join(', ') : null;
    }
  }

  const shippingMethod =
    valueAfterLabel(lines, ['SHIPPING METHOD', 'Shipping Method', 'METHOD OF SHIPMENT']) ||
    valueOnSameLine(lines, ['SHIPPING METHOD', 'Shipping Method', 'METHOD OF SHIPMENT']);

  const portOfLoading =
    valueAfterLabel(lines, ['PORT OF LOADING', 'Port of Loading']) ||
    valueOnSameLine(lines, ['PORT OF LOADING', 'Port of Loading']);

  const portOfDischarge =
    valueAfterLabel(lines, ['PORT OF DISCHARGE', 'Port of Discharge']) ||
    valueOnSameLine(lines, ['PORT OF DISCHARGE', 'Port of Discharge']);

  const placeOfDelivery =
    valueAfterLabel(lines, ['PLACE OF DELIVERY', 'Place of Delivery']) ||
    valueOnSameLine(lines, ['PLACE OF DELIVERY', 'Place of Delivery']);

  const paymentTerm =
    valueAfterLabel(lines, ['PAYMENT TERM', 'Payment Term', 'PAYMENT TERMS']) ||
    valueOnSameLine(lines, ['PAYMENT TERM', 'Payment Term', 'PAYMENT TERMS']);

  const countryOfOrigin =
    valueAfterLabel(lines, ['COUNTRY OF ORIGIN', 'Country of Origin']) ||
    valueOnSameLine(lines, ['COUNTRY OF ORIGIN', 'Country of Origin']);

  const termsOfDelivery =
    valueAfterLabel(lines, ['TERMS OF DELIVERY', 'Terms of Delivery']) ||
    valueOnSameLine(lines, ['TERMS OF DELIVERY', 'Terms of Delivery']);

  // 总计：在 lines 里反向找 "Total Amount" / "Grand Total" / "Total"
  const findAmountAfter = (kw: RegExp): number | null => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (!kw.test(l)) continue;
      // 数字可能在同一行的后半段
      const inline = l.match(/[$€£¥]?\s*([\d.,]+)\s*$/);
      if (inline) {
        const n = parseAmount(inline[1]);
        if (Number.isFinite(n)) return n;
      }
      // 或者在下一行
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const m = lines[j].match(/[$€£¥]?\s*([\d.,]+)/);
        if (m) {
          const n = parseAmount(m[1]);
          if (Number.isFinite(n)) return n;
        }
      }
      break;
    }
    return null;
  };

  const totalAmount =
    findAmountAfter(/\b(grand\s*total|total\s*amount|总\s*金额|合\s*计)\b/i) ||
    findAmountAfter(/\bTotal\b/i);
  const subtotal = findAmountAfter(/\b(sub\s*total|subtotal|小\s*计)\b/i);
  const shippingCharge = findAmountAfter(/\b(shipping|freight|运费)\b/i);
  const other = findAmountAfter(/\b(other|其他费用)\b/i);

  const items = extractItems(rawText, currency || null);

  return {
    piNo: piNo || null,
    poNo: poNo || null,
    date: date || null,
    currency: currency || null,
    consigneeName: consigneeName || null,
    consigneeAddress: consigneeAddress || null,
    shippingMethod: shippingMethod || null,
    portOfLoading: portOfLoading || null,
    portOfDischarge: portOfDischarge || null,
    placeOfDelivery: placeOfDelivery || null,
    paymentTerm: paymentTerm || null,
    countryOfOrigin: countryOfOrigin || null,
    termsOfDelivery: termsOfDelivery || null,
    notes: null,
    subtotal: subtotal,
    shippingCharge: shippingCharge,
    other: other,
    totalAmount: totalAmount,
    items,
    rawText,
  };
}
