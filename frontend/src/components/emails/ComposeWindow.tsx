'use client';

/**
 * 写邮件 —— 独立浮动窗口。
 *
 * 支持：
 *   - 拖拽标题栏移动（normal 模式）
 *   - 最小化（缩成底部任务条，正文保留，可继续编辑前的状态）
 *   - 最大化 / 还原
 *   - 关闭
 *   - 内置富文本编辑器 + 签名 / 模板 / 插入图片等工具
 *
 * 打开时会通过 `getSignature(emailConfigId)` 拉取当前发件账户的签名并
 * 在编辑区末尾可视化插入，避免用户自己粘 HTML。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineXMark,
  HiOutlineMinus,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowsPointingIn,
  HiOutlinePaperAirplane,
  HiOutlinePaperClip,
  HiOutlinePlus,
  HiOutlineDocumentText,
  HiOutlineSparkles,
  HiOutlinePencilSquare,
  HiChevronDown,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';
import RichTextEditor, { RichTextEditorHandle } from './RichTextEditor';
import { emailsApi } from '@/lib/api';
import type { EmailTemplate } from '@/types';

export interface ComposeWindowValue {
  toAddr: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  customerId: string;
  inReplyTo: string;
}

interface Account {
  id: string;
  emailAddr: string;
  fromName?: string | null;
}

interface Customer {
  id: string;
  companyName: string;
}

interface ComposeWindowProps {
  open: boolean;
  onClose: () => void;
  value: ComposeWindowValue;
  onChange: (next: ComposeWindowValue) => void;
  onSend: () => Promise<void> | void;
  sending?: boolean;

  accounts: Account[];
  selectedAccountId: string | null;
  onAccountChange: (id: string | null) => void;

  customers: Customer[];
  templates?: EmailTemplate[];
  /** 新建窗口时允许外部指定初始是否最大化 */
  initialMaximized?: boolean;
}

type WindowMode = 'normal' | 'maximized' | 'minimized';

const DEFAULT_WIDTH = 820;
const DEFAULT_HEIGHT = 620;
const MIN_WIDTH = 480;
const MIN_HEIGHT = 360;

export default function ComposeWindow({
  open,
  onClose,
  value,
  onChange,
  onSend,
  sending,
  accounts,
  selectedAccountId,
  onAccountChange,
  customers,
  templates = [],
  initialMaximized = false,
}: ComposeWindowProps) {
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);

  const [mode, setMode] = useState<WindowMode>(initialMaximized ? 'maximized' : 'normal');
  const [showCcBcc, setShowCcBcc] = useState<boolean>(Boolean(value.cc || value.bcc));
  const [showTemplates, setShowTemplates] = useState(false);
  const [showInsert, setShowInsert] = useState(false);

  // 位置 / 尺寸（normal 模式下生效；最大化/最小化时无视）
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [size, setSize] = useState<{ w: number; h: number }>({ w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT });

  // 打开时把窗口居中到视口里
  useEffect(() => {
    if (!open) return;
    const w = Math.min(DEFAULT_WIDTH, window.innerWidth - 40);
    const h = Math.min(DEFAULT_HEIGHT, window.innerHeight - 40);
    setSize({ w, h });
    setPos({
      x: Math.max(20, (window.innerWidth - w) / 2),
      y: Math.max(20, (window.innerHeight - h) / 2),
    });
    setMode(initialMaximized ? 'maximized' : 'normal');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 打开时 & 账户切换时自动拉签名并可视化插入。
  //
  // 位置规则（模仿 Gmail / Outlook）：
  //   - 已有签名块（data-role="signature"）→ 原地替换
  //   - 正文里有被引用的原始邮件（data-role="quoted"，回复/转发时由
  //     父组件预先放进 bodyHtml）→ 签名插入到该块的"前面"，这样布局是
  //     "用户正在写的正文 → 签名 → 引用的原始邮件"
  //   - 否则 → 追加到正文末尾
  const loadedSigRef = useRef<{ accountId: string | null; html: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    const accountId = selectedAccountId;
    let cancelled = false;
    (async () => {
      try {
        let sigHtml = '';
        if (accountId) {
          const res: any = await emailsApi.getSignature(accountId);
          sigHtml = res.data?.config?.signature || '';
        } else if (accounts[0]?.id) {
          // 没有选发件账户时，用第一个账户的签名
          const res: any = await emailsApi.getSignature(accounts[0].id);
          sigHtml = res.data?.config?.signature || '';
        }
        if (cancelled || !sigHtml) return;

        const wrapped = `<div data-role="signature"><br/>--<br/>${sigHtml}</div>`;
        const cur = editorRef.current?.getHtml() || '';
        const sigRe = /<div[^>]*data-role="signature"[\s\S]*?<\/div>/;
        const quotedRe = /<div[^>]*data-role="quoted"[\s\S]*$/; // 到末尾

        if (sigRe.test(cur)) {
          // 已有签名块：原地替换
          editorRef.current?.setHtml(cur.replace(sigRe, wrapped));
        } else if (quotedRe.test(cur)) {
          // 有 quoted：插到 quoted 之前
          editorRef.current?.setHtml(
            cur.replace(quotedRe, (m) => `${wrapped}${m}`),
          );
        } else {
          // 纯新邮件：追加到末尾
          editorRef.current?.insertHtml(`<br/>${wrapped}`);
        }
        loadedSigRef.current = { accountId, html: sigHtml };
      } catch {
        /* 忽略，签名拿不到就不插 */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedAccountId]);

  // 关闭时重置 loaded 标志，下次打开重新拉
  useEffect(() => {
    if (!open) loadedSigRef.current = null;
  }, [open]);

  // ============== 拖拽 ==============
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'normal') return;
    // 忽略按钮上的点击
    if ((e.target as HTMLElement).closest('button, select, input')) return;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
  };
  const onDragMove = (e: MouseEvent) => {
    const s = dragStartRef.current;
    if (!s) return;
    const nx = s.origX + (e.clientX - s.startX);
    const ny = s.origY + (e.clientY - s.startY);
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 200, nx)),
      y: Math.max(0, Math.min(window.innerHeight - 60, ny)),
    });
  };
  const onDragEnd = () => {
    dragStartRef.current = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  };
  useEffect(() => () => onDragEnd(), []); // 清理

  // ============== 缩放（右下角 resize） ==============
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);
  const onResizeStart = (e: React.MouseEvent) => {
    if (mode !== 'normal') return;
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, origW: size.w, origH: size.h };
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onResizeEnd);
  };
  const onResizeMove = (e: MouseEvent) => {
    const s = resizeRef.current;
    if (!s) return;
    setSize({
      w: Math.max(MIN_WIDTH, Math.min(window.innerWidth - pos.x - 10, s.origW + (e.clientX - s.startX))),
      h: Math.max(MIN_HEIGHT, Math.min(window.innerHeight - pos.y - 10, s.origH + (e.clientY - s.startY))),
    });
  };
  const onResizeEnd = () => {
    resizeRef.current = null;
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeEnd);
  };

  // ============== 布局样式 ==============
  const windowStyle = useMemo<React.CSSProperties>(() => {
    if (mode === 'maximized') {
      return { left: 10, top: 10, width: 'calc(100vw - 20px)', height: 'calc(100vh - 20px)' };
    }
    if (mode === 'minimized') {
      return {
        right: 20,
        bottom: 20,
        width: 320,
        height: 44,
      };
    }
    return { left: pos.x, top: pos.y, width: size.w, height: size.h };
  }, [mode, pos, size]);

  const handleSend = async () => {
    if (sending) return;
    if (!value.toAddr.trim()) {
      toast.error('请输入收件人');
      return;
    }
    if (!value.subject.trim()) {
      toast.error('请输入主题');
      return;
    }
    await onSend();
  };

  // ============== 模板插入 ==============
  const applyTemplate = (tpl: EmailTemplate) => {
    onChange({
      ...value,
      subject: value.subject || tpl.subject || '',
    });
    // 正文：以"加在光标处"的方式插入，保留已有签名和正在写的内容
    editorRef.current?.insertHtml(tpl.bodyHtml || '');
    setShowTemplates(false);
  };

  if (!open) return null;

  const currentAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;
  const fromLabel = currentAccount
    ? currentAccount.fromName
      ? `${currentAccount.fromName} <${currentAccount.emailAddr}>`
      : currentAccount.emailAddr
    : '默认账户';

  return (
    <div
      ref={windowRef}
      className="fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
      style={windowStyle}
    >
      {/* ============== 标题栏 ============== */}
      <div
        onMouseDown={onHeaderMouseDown}
        className={`flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 ${
          mode === 'normal' ? 'cursor-move' : ''
        }`}
        style={{ userSelect: 'none' }}
      >
        {/* 发送按钮（仿照截图放在最左） */}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="inline-flex items-center gap-1.5 rounded-md bg-rose-500 px-3 py-1 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50"
          title="发送 (Ctrl+Enter)"
        >
          <HiOutlinePaperAirplane className="h-4 w-4 -rotate-45" />
          {sending ? '发送中…' : '发送'}
        </button>

        {/* 发件人选择 */}
        <div className="ml-1 min-w-0 flex-1">
          {mode === 'minimized' ? (
            <span className="truncate text-sm font-medium text-gray-700">
              写邮件：{value.subject || '(无主题)'}
            </span>
          ) : accounts.length > 1 ? (
            <div className="flex items-center gap-1">
              <select
                value={selectedAccountId || ''}
                onChange={(e) => onAccountChange(e.target.value || null)}
                className="max-w-full truncate border-none bg-transparent text-sm text-gray-700 focus:outline-none"
              >
                {!selectedAccountId && <option value="">默认账户</option>}
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fromName ? `${a.fromName} <${a.emailAddr}>` : a.emailAddr}
                  </option>
                ))}
              </select>
              <HiChevronDown className="h-3 w-3 text-gray-400" />
            </div>
          ) : (
            <span className="truncate text-sm text-gray-700">{fromLabel}</span>
          )}
        </div>

        {/* 右侧控件 */}
        <button
          type="button"
          onClick={() => setMode(mode === 'minimized' ? 'normal' : 'minimized')}
          className="rounded-full p-1 text-gray-500 hover:bg-gray-200"
          title="最小化"
        >
          <HiOutlineMinus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            setMode((m) => (m === 'maximized' ? 'normal' : 'maximized'))
          }
          className="rounded-full p-1 text-gray-500 hover:bg-gray-200"
          title={mode === 'maximized' ? '还原' : '最大化'}
        >
          {mode === 'maximized' ? (
            <HiOutlineArrowsPointingIn className="h-4 w-4" />
          ) : (
            <HiOutlineArrowsPointingOut className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-gray-500 hover:bg-red-100 hover:text-red-600"
          title="关闭"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      </div>

      {/* ============== 主体（最小化时隐藏） ============== */}
      {mode !== 'minimized' && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 收件人 / 抄送 / 密送 / 主题 / 客户 */}
          <div className="flex-shrink-0 border-b border-gray-100">
            {/* 收件人 */}
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
              <span className="w-14 flex-shrink-0 text-sm text-gray-500">收件人</span>
              <input
                type="text"
                value={value.toAddr}
                onChange={(e) => onChange({ ...value, toAddr: e.target.value })}
                placeholder="对方邮箱地址，多个用逗号分隔"
                className="flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="text-xs text-gray-400 hover:text-blue-600"
                  title="添加抄送 / 密送"
                >
                  抄送
                </button>
              )}
            </div>

            {showCcBcc && (
              <>
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
                  <span className="w-14 flex-shrink-0 text-sm text-gray-500">抄送</span>
                  <input
                    type="text"
                    value={value.cc}
                    onChange={(e) => onChange({ ...value, cc: e.target.value })}
                    placeholder="抄送邮箱"
                    className="flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
                  <span className="w-14 flex-shrink-0 text-sm text-gray-500">密送</span>
                  <input
                    type="text"
                    value={value.bcc}
                    onChange={(e) => onChange({ ...value, bcc: e.target.value })}
                    placeholder="密送邮箱"
                    className="flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
              </>
            )}

            {/* 主题 */}
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2">
              <span className="w-14 flex-shrink-0 text-sm text-gray-500">主题</span>
              <input
                type="text"
                value={value.subject}
                onChange={(e) => onChange({ ...value, subject: e.target.value })}
                placeholder="请输入邮件主题"
                className="flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
              />
            </div>

            {/* 关联客户 */}
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="w-14 flex-shrink-0 text-sm text-gray-500">客户</span>
              <select
                value={value.customerId}
                onChange={(e) => onChange({ ...value, customerId: e.target.value })}
                className="flex-1 border-none bg-transparent text-sm text-gray-900 focus:outline-none"
              >
                <option value="">不关联客户</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 富文本编辑器 */}
          <RichTextEditor
            ref={editorRef}
            value={value.bodyHtml}
            onChange={(html) => onChange({ ...value, bodyHtml: html })}
            placeholder="智能写信新体验，试试唤起 邮箱AI助理"
            flex
            className="!rounded-none !border-0 !border-t !border-gray-100"
            extraToolbar={
              <>
                {/* 附件 */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toast('邮件附件功能尚在开发中')}
                  className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-gray-700 hover:bg-gray-100"
                  title="添加附件"
                >
                  <HiOutlinePaperClip className="h-4 w-4" />
                  <span>附件</span>
                  <HiChevronDown className="h-3 w-3 text-gray-400" />
                </button>

                {/* 插入 —— 弹出"图片 / 链接" */}
                <div className="relative">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowInsert((v) => !v)}
                    className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-gray-700 hover:bg-gray-100"
                    title="插入"
                  >
                    <HiOutlinePlus className="h-4 w-4" />
                    <span>插入</span>
                    <HiChevronDown className="h-3 w-3 text-gray-400" />
                  </button>
                  {showInsert && (
                    <div
                      className="absolute left-0 top-full z-30 mt-1 w-32 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                      onMouseLeave={() => setShowInsert(false)}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const url = window.prompt('请输入链接地址');
                          if (url) {
                            const text = window.prompt('显示文字（可选）', url) || url;
                            editorRef.current?.insertHtml(
                              `<a href="${url.replace(/"/g, '&quot;')}">${text}</a>`,
                            );
                          }
                          setShowInsert(false);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                      >
                        链接
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          const url = window.prompt('请输入图片 URL');
                          if (url) {
                            editorRef.current?.insertHtml(
                              `<img src="${url.replace(/"/g, '&quot;')}" alt="" style="max-width:100%;height:auto;"/>`,
                            );
                          }
                          setShowInsert(false);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                      >
                        图片
                      </button>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          editorRef.current?.insertHtml(
                            `<div style="border-top:1px solid #e5e7eb;margin:12px 0;"></div>`,
                          );
                          setShowInsert(false);
                        }}
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                      >
                        分割线
                      </button>
                    </div>
                  )}
                </div>

                {/* 跟单模板 */}
                <div className="relative">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setShowTemplates((v) => !v)}
                    className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-gray-700 hover:bg-gray-100"
                    title="跟单模板"
                  >
                    <HiOutlineDocumentText className="h-4 w-4" />
                    <span>跟单模板</span>
                  </button>
                  {showTemplates && (
                    <div
                      className="absolute left-0 top-full z-30 mt-1 max-h-64 w-64 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                      onMouseLeave={() => setShowTemplates(false)}
                    >
                      {templates.length === 0 ? (
                        <div className="px-3 py-3 text-center text-xs text-gray-400">
                          暂无模板
                        </div>
                      ) : (
                        templates.map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyTemplate(tpl)}
                            className="block w-full border-b border-gray-50 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
                          >
                            <div className="font-medium text-gray-800">{tpl.name}</div>
                            {tpl.subject && (
                              <div className="truncate text-xs text-gray-400">{tpl.subject}</div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* AI 智能写信 */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toast('AI 写信功能尚在开发中')}
                  className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-violet-600 hover:bg-violet-50"
                  title="AI 智能写信"
                >
                  <HiOutlineSparkles className="h-4 w-4" />
                  <span>智能写信</span>
                  <HiChevronDown className="h-3 w-3 text-violet-400" />
                </button>

                {/* 签名 —— 手动把签名追加进来（兼容用户删掉了自动插入的情况） */}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    try {
                      const accountId = selectedAccountId || accounts[0]?.id;
                      if (!accountId) {
                        toast.error('尚未配置邮箱账户');
                        return;
                      }
                      const res: any = await emailsApi.getSignature(accountId);
                      const sig = res.data?.config?.signature;
                      if (!sig) {
                        toast('当前账户未设置签名');
                        return;
                      }
                      editorRef.current?.insertHtml(`<br/>--<br/>${sig}`);
                    } catch {
                      /* */
                    }
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-gray-700 hover:bg-gray-100"
                  title="插入签名"
                >
                  <HiOutlinePencilSquare className="h-4 w-4" />
                  <span>签名</span>
                </button>
              </>
            }
          />
        </div>
      )}

      {/* ============== 右下角 resize handle ============== */}
      {mode === 'normal' && (
        <div
          onMouseDown={onResizeStart}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize"
          style={{
            background:
              'linear-gradient(135deg, transparent 0 50%, #cbd5e1 50% 60%, transparent 60% 70%, #cbd5e1 70% 80%, transparent 80% 100%)',
          }}
        />
      )}
    </div>
  );
}
