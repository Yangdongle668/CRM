/**
 * 邮件翻译的前端部分：从邮件 HTML 里抽出可翻译的文本节点，拿到译文后
 * 就地替换，保留原有排版。
 *
 * 默认跳过"引用的历史邮件"——长线程里引用部分往往是正文的好几倍，
 * 全翻既慢又没必要；用户可以再点"翻译引用内容"补上。
 */

// 常见客户端的引用块标记
const QUOTE_SELECTOR = [
  'blockquote',
  '[data-role="quoted"]', // 本系统回复 / 转发时插入的引用
  '.gmail_quote',
  '.gmail_extra',
  '.yahoo_quoted',
  '.moz-cite-prefix',
].join(',');

// Outlook 不包引用块：回复头 div 之后的所有内容都是历史邮件
const OUTLOOK_REPLY_HEADER = '#divRplyFwdMsg, #appendonsend';

const SKIP_TAGS = /^(img|style|script|svg|video|audio|iframe|head|title)$/i;

// tsconfig 的 target 是 es5，正则字面量不能带 u 标志，用构造函数
const LETTER = new RegExp('\\p{L}', 'u');
const LETTERS = new RegExp('\\p{L}', 'gu');
const HAN = new RegExp('\\p{Script=Han}', 'gu');

// 只含这些纯格式标签的段落整段翻译：逐个文本节点翻会把句子切碎
// （"пришлите предложение на <b>500 штук</b>" 拆成两半各译各的）。
// 代价是段内的加粗 / 斜体会丢，链接、换行、图片所在的段落不合并。
const INLINE_FORMAT = /^(b|strong|i|em|u|span|font|small|big|sub|sup|mark|s|strike)$/i;
const BLOCK = /^(p|div|li|td|th|h[1-6]|dd|dt|figcaption|caption|label)$/i;

function isPlainInline(el: Element): boolean {
  for (const child of Array.from(el.children)) {
    if (!INLINE_FORMAT.test(child.tagName) || !isPlainInline(child)) return false;
  }
  return true;
}

export interface ExtractResult {
  doc: Document;
  /** node 是单个文本节点，或整段合并翻译的块元素 */
  segments: { index: number; text: string; node: Text | Element }[];
  /** 是否有被跳过的引用内容 */
  quotedSkipped: boolean;
}

export function extractSegments(
  html: string,
  opts: { includeQuoted?: boolean } = {},
): ExtractResult {
  // DOMParser 生成的是惰性文档：不执行脚本、不加载图片，可以安全解析外部 HTML
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const segments: ExtractResult['segments'] = [];
  let quotedSkipped = false;
  let stop = false;

  const hasText = (el: Element) => (el.textContent || '').trim().length > 1;

  const walk = (node: Node) => {
    if (stop) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      if (SKIP_TAGS.test(el.tagName)) return;
      if (!opts.includeQuoted) {
        if (el.matches(OUTLOOK_REPLY_HEADER)) {
          stop = true;
          quotedSkipped = true;
          return;
        }
        if (el.matches(QUOTE_SELECTOR)) {
          if (hasText(el)) quotedSkipped = true;
          return;
        }
      }
      if (BLOCK.test(el.tagName) && el.children.length > 0 && isPlainInline(el)) {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (t.length > 1 && LETTER.test(t)) {
          segments.push({ index: segments.length, text: t, node: el });
        }
        return;
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').trim();
      // 纯数字 / 符号不用翻
      if (t.length > 1 && LETTER.test(t)) {
        segments.push({ index: segments.length, text: t, node: node as Text });
      }
      return;
    }
    node.childNodes.forEach(walk);
  };
  walk(doc.body);

  // 整封都是引用（例如纯转发）时，没东西可翻就退回到全文翻译
  if (segments.length === 0 && quotedSkipped && !opts.includeQuoted) {
    return extractSegments(html, { includeQuoted: true });
  }
  return { doc, segments, quotedSkipped };
}

/**
 * 把译文写回文档：每段替换成 <span title="原文">译文</span>，
 * 鼠标悬停就能对照原文。
 */
export function applyTranslations(
  result: ExtractResult,
  translated: Record<number, string>,
): string {
  for (const seg of result.segments) {
    const tr = translated[seg.index];
    if (!tr || tr === seg.text) continue;
    const span = result.doc.createElement('span');
    span.textContent = tr;
    span.title = seg.text;
    if (seg.node.nodeType === Node.TEXT_NODE) {
      seg.node.replaceWith(span);
    } else {
      (seg.node as Element).replaceChildren(span);
    }
  }
  return result.doc.body.innerHTML;
}

/** 正文是否基本是中文（中文字符占字母类字符一半以上）。 */
export function isMostlyChinese(text: string): boolean {
  const letters = text.match(LETTERS);
  if (!letters || letters.length < 4) return false;
  const han = text.match(HAN)?.length || 0;
  return han / letters.length > 0.5;
}

/** 从 HTML 里取纯文本（用于语言判断），不执行任何内容。 */
export function htmlToText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

const LANG_NAMES: Record<string, string> = {
  en: '英文',
  ru: '俄文',
  es: '西班牙文',
  pt: '葡萄牙文',
  de: '德文',
  fr: '法文',
  it: '意大利文',
  nl: '荷兰文',
  pl: '波兰文',
  tr: '土耳其文',
  ar: '阿拉伯文',
  fa: '波斯文',
  he: '希伯来文',
  ja: '日文',
  ko: '韩文',
  vi: '越南文',
  th: '泰文',
  id: '印尼文',
  ms: '马来文',
  hi: '印地文',
  uk: '乌克兰文',
  'zh-CN': '中文',
  'zh-TW': '繁体中文',
};

export function langName(code?: string | null): string {
  if (!code || code === 'auto') return '自动识别';
  return LANG_NAMES[code] || code.toUpperCase();
}
