'use client';

import React from 'react';
import Link from 'next/link';
import type { WidgetProps } from '../types';

export function MemosWidget({ data }: WidgetProps) {
  const { todayMemos } = data;
  return (
    <>
      {todayMemos.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">今日暂无备忘录</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {todayMemos.slice(0, 6).map((memo) => (
            <Link
              key={memo.id}
              href="/memos"
              className="rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-shadow block"
              style={{ backgroundColor: memo.color || '#ffffff' }}
            >
              <h4 className="text-sm font-medium text-gray-900 truncate">{memo.title}</h4>
              {memo.content && (
                <p className="mt-1 text-xs text-gray-600 line-clamp-2">{memo.content}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
