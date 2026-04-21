'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { HiOutlineBellAlert, HiOutlineXMark } from 'react-icons/hi2';
import { followUpsApi } from '@/lib/api';

/**
 * 登录后若有逾期跟进，全局顶部条提醒一次。
 * 用 sessionStorage 记一次关闭，本次浏览器 tab 内不再弹；刷新页面或
 * 下次重新打开会再次检查。
 */
const DISMISS_KEY = 'followUp:bannerDismissed';

export default function FollowUpBanner() {
  const [overdue, setOverdue] = useState(0);
  const [dismissed, setDismissed] = useState(true); // 默认不显示，fetch 完再决定

  useEffect(() => {
    try {
      const v = sessionStorage.getItem(DISMISS_KEY);
      setDismissed(v === '1');
    } catch {
      setDismissed(false);
    }
    followUpsApi
      .summary()
      .then((res: any) => {
        setOverdue(res.data?.overdue ?? 0);
      })
      .catch(() => {});
  }, []);

  if (dismissed || overdue <= 0) return null;

  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 sm:gap-3 bg-amber-50 border-b border-amber-200 px-3 sm:px-6 py-2 text-xs sm:text-sm text-amber-900">
      <div className="flex items-center gap-2 min-w-0">
        <HiOutlineBellAlert className="h-4 w-4 flex-shrink-0 text-amber-600" />
        <span className="truncate">
          你有 <span className="font-semibold">{overdue}</span> 条跟进已逾期，需要尽快处理。
        </span>
        <Link
          href="/follow-ups"
          className="ml-2 flex-shrink-0 rounded-md bg-amber-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-amber-700"
        >
          去处理
        </Link>
      </div>
      <button
        onClick={close}
        className="flex-shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100"
        aria-label="关闭"
        title="本次会话不再提醒"
      >
        <HiOutlineXMark className="h-4 w-4" />
      </button>
    </div>
  );
}
