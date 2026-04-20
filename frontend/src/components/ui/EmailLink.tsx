'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from './Modal';

export type EmailLinkPreference = 'ask' | 'external' | 'internal';

const STORAGE_KEY = 'emailLinkPreference';

export const getEmailLinkPreference = (): EmailLinkPreference => {
  if (typeof window === 'undefined') return 'ask';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'external' || v === 'internal' || v === 'ask') return v;
  return 'ask';
};

export const setEmailLinkPreference = (v: EmailLinkPreference) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, v);
};

interface EmailLinkProps {
  email: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * 点击邮箱链接时，根据用户偏好决定：
 *  - external: 调用系统默认邮件客户端（mailto:）
 *  - internal: 跳到 /emails 并自动打开撰写窗口，收件人预填
 *  - ask: 弹窗让用户选择，可勾选"记住选择"
 *
 * 偏好存 localStorage，可在"设置 → 个人资料"里修改。
 */
export function EmailLink({ email, className, children }: EmailLinkProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  // 防止同一个 email 同一页多个链接同时打开
  const prefRef = useRef<EmailLinkPreference>('ask');

  useEffect(() => {
    prefRef.current = getEmailLinkPreference();
  }, []);

  if (!email) return null;

  const openExternal = () => {
    window.location.href = `mailto:${email}`;
  };
  const openInternal = () => {
    router.push(`/emails?composeTo=${encodeURIComponent(email)}`);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pref = getEmailLinkPreference();
    prefRef.current = pref;
    if (pref === 'external') return openExternal();
    if (pref === 'internal') return openInternal();
    setRemember(false);
    setDialogOpen(true);
  };

  const choose = (choice: 'external' | 'internal') => {
    if (remember) setEmailLinkPreference(choice);
    setDialogOpen(false);
    if (choice === 'external') openExternal();
    else openInternal();
  };

  return (
    <>
      <a
        href={`mailto:${email}`}
        onClick={handleClick}
        className={className ?? 'text-blue-600 hover:underline'}
      >
        {children ?? email}
      </a>

      <Modal
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="使用哪种方式发送邮件？"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 break-all">
            发送到：<span className="font-medium text-gray-900">{email}</span>
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => choose('internal')}
              className="group flex flex-col items-start gap-1 rounded-lg border border-gray-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                系统邮件
              </span>
              <span className="text-xs text-gray-500">在当前系统里撰写发送</span>
            </button>

            <button
              type="button"
              onClick={() => choose('external')}
              className="group flex flex-col items-start gap-1 rounded-lg border border-gray-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                外部邮箱
              </span>
              <span className="text-xs text-gray-500">使用系统默认邮件客户端</span>
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            记住我的选择（可在"设置 → 个人资料"中修改）
          </label>
        </div>
      </Modal>
    </>
  );
}

export default EmailLink;
