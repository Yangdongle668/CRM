'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBell,
  HiOutlineCheck,
  HiOutlineEnvelopeOpen,
} from 'react-icons/hi2';
import { emailsApi } from '@/lib/api';

const STORAGE_KEY = 'emails:openNotifsReadAt';
const POLL_INTERVAL_MS = 30_000;

interface NotificationItem {
  id: string;
  subject: string;
  toAddr: string;
  firstOpenAt: string | null;
  lastOpenedAt: string | null;
  viewCount: number;
}

interface Props {
  /** 点击单条通知时调用，父级可以借此把右侧详情打开到这封邮件 */
  onOpenEmail?: (emailId: string) => void;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!t) return '';
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 从 "Name <addr@x.com>" 里抽出显示名；没有名字就展示邮箱。
 * 给铃铛列表用，空间有限，尽量显示人类可读的姓名。
 */
function shortRecipient(raw: string): string {
  if (!raw) return '';
  const m = raw.match(/^\s*(.*?)<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^["']|["']$/g, '').trim();
    return name || m[2].trim();
  }
  return raw.trim();
}

export default function OpenNotificationBell({ onOpenEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [latestAt, setLatestAt] = useState<string | null>(null);
  const [firstLoaded, setFirstLoaded] = useState(false);
  const prevTotalRef = useRef(0);
  const [pulse, setPulse] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const since = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(STORAGE_KEY);
  }, []);

  const refresh = useCallback(async () => {
    const savedSince =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
    try {
      const res: any = await emailsApi.openNotifications(savedSince, 10);
      const data = res?.data || res;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total) || 0);
      setLatestAt(data?.latestAt || null);
      setFirstLoaded(true);
    } catch {
      // 静默：后端异常不要打断用户，铃铛保持静默。
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // 只挂一次；refresh 内部每次都会读最新的 since。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新消息到来时触发一次轻微 pulse 动画（500ms），只在数字变大时触发。
  useEffect(() => {
    if (!firstLoaded) {
      prevTotalRef.current = total;
      return;
    }
    if (total > prevTotalRef.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1200);
      prevTotalRef.current = total;
      return () => clearTimeout(t);
    }
    prevTotalRef.current = total;
  }, [total, firstLoaded]);

  // 点外部关闭面板
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const markAllRead = useCallback(() => {
    // 把"最新一次打开时间"写进 localStorage 当作下次请求的 since。
    // 没拿到 latestAt 就用 now() 兜底，不留盲区。
    const anchor = latestAt || new Date().toISOString();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, anchor);
    }
    setItems([]);
    setTotal(0);
    setLatestAt(null);
  }, [latestAt]);

  const handleItemClick = (id: string) => {
    onOpenEmail?.(id);
    setOpen(false);
  };

  const hasUnread = total > 0;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="已读通知"
        title={hasUnread ? `${total} 封邮件被阅读过` : '已读通知'}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-50 hover:text-blue-600 ${
          hasUnread ? 'ring-2 ring-blue-100' : ''
        }`}
      >
        <HiOutlineBell
          className={`h-5 w-5 ${pulse ? 'animate-bell-swing' : ''} ${
            hasUnread ? 'text-blue-600' : ''
          }`}
        />
        {hasUnread && (
          <>
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-[16px] text-white shadow">
              {total > 99 ? '99+' : total}
            </span>
            <span
              className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] w-[18px] animate-ping rounded-full bg-red-400 opacity-60"
              aria-hidden
            />
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <HiOutlineEnvelopeOpen className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-800">收件人已读</span>
              {total > 0 && (
                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-600">
                  {total}
                </span>
              )}
            </div>
            {total > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
                title="全部标记为已知悉"
              >
                <HiOutlineCheck className="h-3.5 w-3.5" />
                全部确认
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                <HiOutlineEnvelopeOpen className="mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">暂无新的已读提醒</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  有人打开你发出的邮件时会在这里提示
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(it.id)}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-blue-50/60"
                    >
                      <div className="flex items-start gap-2">
                        <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600">
                          <HiOutlineEnvelopeOpen className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-gray-900">
                            {it.subject || '（无主题）'}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-gray-600">
                            <span className="text-gray-400">收件人：</span>
                            {shortRecipient(it.toAddr)}
                          </p>
                          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-400">
                            <span>{timeAgo(it.firstOpenAt)} 已读</span>
                            {it.viewCount > 1 && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                                共 {it.viewCount} 次
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* 铃铛轻摇动画：只在收到新通知时放一次，避免干扰 */}
      <style jsx>{`
        @keyframes bellSwing {
          0% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(10deg); }
          60% { transform: rotate(-8deg); }
          75% { transform: rotate(5deg); }
          100% { transform: rotate(0deg); }
        }
        :global(.animate-bell-swing) {
          animation: bellSwing 1.2s ease-in-out;
          transform-origin: top center;
        }
      `}</style>
    </div>
  );
}
