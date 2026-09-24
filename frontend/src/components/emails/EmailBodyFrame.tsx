'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sanitizeEmailHtml } from '@/lib/sanitize-email';

/**
 * 邮件正文渲染器：净化后放进沙箱 iframe。
 *
 * - sandbox 不含 allow-scripts：即使净化漏掉了什么，iframe 里也不会执行脚本。
 * - allow-same-origin：只为了让父页面能读 iframe 的文档高度做自适应；
 *   没有 allow-scripts 时这不构成逃逸风险。
 * - allow-popups(+escape-sandbox)：正文里的链接用 <base target="_blank">
 *   在新标签页正常打开。
 * - 邮件自带的 <style> 只作用于 iframe 内部，不会再把 CRM 页面样式搞乱。
 */
const FRAME_BASE_CSS = `
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC',
      'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; }
  a { color: #2563eb; }
  blockquote { margin: 0 0 0 4px; padding-left: 12px; border-left: 2px solid #d1d5db; color: #6b7280; }
`;

interface Props {
  html: string;
  className?: string;
  /** 最小高度（px），加载前占位用。 */
  minHeight?: number;
}

export default function EmailBodyFrame({ html, className, minHeight = 80 }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(minHeight);
  // DOMPurify 依赖浏览器 DOM，只能在客户端算；SSR 阶段先渲染空 iframe，
  // 否则 hydration 会沿用服务端的空 srcDoc。
  const [srcDoc, setSrcDoc] = useState<string | null>(null);

  useEffect(() => {
    const clean = sanitizeEmailHtml(html);
    setSrcDoc(
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
        '<base target="_blank">' +
        `<style>${FRAME_BASE_CSS}</style>` +
        `</head><body>${clean}</body></html>`,
    );
  }, [html]);

  const measure = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.documentElement) return;
    const h = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
    if (h > 0) setHeight(Math.max(minHeight, h));
  }, [minHeight]);

  const handleLoad = useCallback(() => {
    measure();
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    // 图片加载完、窗口宽度变化都会改变正文高度
    roRef.current?.disconnect();
    roRef.current = new ResizeObserver(() => measure());
    roRef.current.observe(doc.body);
    doc.addEventListener('load', measure, true);
  }, [measure]);

  useEffect(() => () => roRef.current?.disconnect(), []);

  return (
    <iframe
      ref={iframeRef}
      title="邮件正文"
      srcDoc={srcDoc ?? ''}
      onLoad={srcDoc ? handleLoad : undefined}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className={className}
      style={{ width: '100%', height, border: 0, display: 'block' }}
    />
  );
}
