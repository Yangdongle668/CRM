import DOMPurify from 'dompurify';

/**
 * 邮件 HTML 净化。收到的邮件正文来自外部任意发件人，直接塞进页面会执行
 * 其中的 onerror / javascript: 等脚本（登录 token 在 localStorage 里，
 * 等于把账号交出去）。所有展示 / 引用外部邮件 HTML 的地方都要先过这里。
 *
 * 保留 <style>：正文最终渲染在沙箱 iframe 里（见 EmailBodyFrame），
 * 样式不会影响 CRM 页面本身；引用进写信编辑器时样式也只作用于引用块。
 */
const FORBID_TAGS = [
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'base',
  'meta',
  'link',
];

export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return '';
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    FORBID_TAGS,
    FORBID_ATTR: ['srcset', 'formaction', 'action'],
    // 邮件 HTML 常以 <style> 开头，不加 FORCE_BODY 会被当成 <head> 内容丢掉。
    FORCE_BODY: true,
  });
}

/** 纯文本转义后再拼进 HTML（发件人、主题这类头信息）。 */
export function escapeHtml(text: string | null | undefined): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
