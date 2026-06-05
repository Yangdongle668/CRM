'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  HiOutlineBookmark,
  HiOutlineClock,
  HiOutlinePlus,
} from 'react-icons/hi2';
import type { WidgetProps } from '../types';

/**
 * 客户跟进面板（仪表盘版）——只显示 pinnedStatus=ACTIVE 的常驻跟进，
 * 按"最近一次联系时间倒序"排，让最近活跃的客户冒到顶。
 *
 * 点击卡片跳转到 /memos?followUp=<id>，memos 页会读 query 参数自动
 * 打开对应跟进的时间线弹窗，零摩擦记录"今天又联系了"。
 */
export function FollowUpMemosWidget({ data }: WidgetProps) {
  const router = useRouter();
  const memos = data.pinnedMemos || [];

  if (memos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center px-4">
        <HiOutlineBookmark className="h-8 w-8 text-gray-300 mb-2" />
        <p className="text-sm text-gray-400 mb-2">还没有客户跟进</p>
        <Link
          href="/memos"
          className="inline-flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HiOutlinePlus className="h-3 w-3" /> 去备忘录页新建
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {memos.map((m) => {
          const last = m.timeline?.[0];
          const lastDate = last ? new Date(last.contactedAt) : null;
          const daysSince = lastDate
            ? Math.floor((Date.now() - lastDate.getTime()) / 86400000)
            : null;
          const chipClass =
            daysSince === null
              ? 'bg-gray-100 text-gray-500'
              : daysSince <= 1
              ? 'bg-green-50 text-green-700'
              : daysSince <= 7
              ? 'bg-amber-50 text-amber-700'
              : 'bg-red-50 text-red-700';
          const chipLabel =
            daysSince === null
              ? '未跟进'
              : daysSince === 0
              ? '今天'
              : `${daysSince}天前`;
          return (
            <li
              key={m.id}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => router.push(`/memos?followUp=${m.id}`)}
              className="py-2.5 px-1 cursor-pointer hover:bg-gray-50 rounded-md transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {m.title}
                  </div>
                  {last ? (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      <span className="font-mono text-gray-400 mr-1.5">
                        {lastDate!.toLocaleDateString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                        })}
                      </span>
                      {last.note}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 italic mt-0.5">
                      点击添加首次跟进记录
                    </div>
                  )}
                </div>
                <span
                  className={`flex-shrink-0 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${chipClass}`}
                >
                  <HiOutlineClock className="h-3 w-3" />
                  {chipLabel}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 pt-2 border-t border-gray-100 text-right">
        <Link
          href="/memos"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-xs text-primary-500 hover:text-primary-600"
        >
          查看全部 →
        </Link>
      </div>
    </div>
  );
}
