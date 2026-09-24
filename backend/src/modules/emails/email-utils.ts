/**
 * 邮件模块的纯函数工具：列表预览 snippet、垃圾邮件判断。
 * 不依赖 Nest / Prisma，收信同步和发信两边共用。
 */

const SNIPPET_LENGTH = 200;

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * 生成列表预览：优先用纯文本正文，没有就从 HTML 里剥标签（连同
 * <style>/<script>/<head> 的内容一起去掉），折叠空白，截 200 字。
 */
export function makeSnippet(
  bodyText?: string | null,
  bodyHtml?: string | null,
): string {
  let text = (bodyText || '').trim();
  if (!text && bodyHtml) {
    text = bodyHtml
      .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
        if (code[0] === '#') {
          const n = code[1] === 'x' || code[1] === 'X'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
          return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
        }
        return ENTITIES[code.toLowerCase()] ?? m;
      });
  }
  text = text.replace(/\s+/g, ' ').trim();
  // 按码点截断，避免把 emoji 等代理对切成半个
  const chars = Array.from(text);
  return chars.length > SNIPPET_LENGTH ? chars.slice(0, SNIPPET_LENGTH).join('') : text;
}

// ── Spam filter ───────────────────────────────────────────
// Lightweight keyword/pattern filter aimed at the unsolicited
// SEO / marketing / phishing junk that foreign-trade inboxes
// drown in. Runs on every IMAP-fetched email and can also be
// triggered retroactively via POST /emails/scan-spam.

const SPAM_SUBJECT_KEYWORDS = [
  // SEO / ranking spam
  'seo', 'ranking', 'backlink', 'link building', 'page rank',
  'search engine', 'google ranking', 'first page',
  'top of google', 'website traffic', 'domain authority',
  // Web / app dev spam
  'web design', 'website redesign', 'app development',
  'mobile app', 'wordpress', 'shopify',
  // Digital marketing spam
  'digital marketing', 'social media marketing', 'email marketing',
  'lead generation', 'facebook ads', 'google ads',
  'content marketing', 'brand awareness', 'influencer',
  // Generic commercial spam
  'limited time offer', 'act now', 'buy now',
  'free trial', 'special offer', 'exclusive deal',
  'make money', 'earn money', 'work from home',
  'casino', 'lottery', 'winner', 'bitcoin', 'crypto',
  'weight loss', 'diet',
  // Phishing
  'verify your account', 'confirm your identity',
  'update your payment', 'account suspended',
  'unusual activity', 'security alert',
  // B2B spam common in foreign trade
  'business proposal', 'partnership opportunity',
  'data entry', 'virtual assistant',
  'alibaba', 'supplier list', 'manufacturers list',
];

const SPAM_SENDER_PATTERNS = [
  'newsletter@', 'marketing@',
  'promo@', 'offers@', 'deals@', 'info@seo',
  'sales@seo', 'hello@seo', 'contact@seo',
];

/**
 * Returns true if the email looks like spam based on subject keywords
 * and sender patterns. Case-insensitive matching.
 */
export function isSpam(email: { subject?: string | null; fromAddr?: string | null; bodyText?: string | null }): boolean {
  const subject = (email.subject || '').toLowerCase();
  const from = (email.fromAddr || '').toLowerCase();

  for (const pattern of SPAM_SENDER_PATTERNS) {
    if (from.includes(pattern)) return true;
  }

  for (const kw of SPAM_SUBJECT_KEYWORDS) {
    if (subject.includes(kw)) return true;
  }

  return false;
}
