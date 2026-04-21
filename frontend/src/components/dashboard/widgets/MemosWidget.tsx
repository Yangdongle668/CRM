'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { memosApi } from '@/lib/api';
import type { Memo } from '@/types';
import type { WidgetProps } from '../types';

const COLORS = ['#ffffff', '#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#f3e8ff', '#ffedd5'];

/** 拖拽容器的子元素要阻止冒泡，不然 react-grid-layout 会把点击/拖动吞掉 */
const stopDrag = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
};

export function MemosWidget({ data }: WidgetProps) {
  // 本地副本：允许 widget 内直接追加/删除不用等父组件重拉
  const [memos, setMemos] = useState<Memo[]>(data.todayMemos);
  const [title, setTitle] = useState('');
  const [color, setColor] = useState<string>('#fef3c7');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 父层刷新时同步
  useEffect(() => {
    setMemos(data.todayMemos);
  }, [data.todayMemos]);

  const handleCreate = async () => {
    const t = title.trim();
    if (!t) {
      toast.error('请输入备忘内容');
      inputRef.current?.focus();
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const res: any = await memosApi.create({
        title: t,
        content: '',
        color,
        date: today.toISOString(),
      });
      const newMemo: Memo = res?.data ?? res;
      if (newMemo && newMemo.id) {
        setMemos((prev) => [newMemo, ...prev]);
      }
      setTitle('');
      toast.success('已添加备忘');
      inputRef.current?.focus();
    } catch {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    } else if (e.key === 'Escape') {
      setTitle('');
    }
  };

  const cycleColor = () => {
    const idx = COLORS.indexOf(color);
    setColor(COLORS[(idx + 1) % COLORS.length]);
  };

  return (
    <div className="flex h-full flex-col gap-3">
      {/* 新建备忘输入行 */}
      <div
        {...stopDrag}
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-1.5 shadow-sm focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100"
      >
        <button
          type="button"
          onClick={cycleColor}
          className="h-5 w-5 flex-shrink-0 rounded-full border border-gray-300 transition hover:scale-110"
          style={{ backgroundColor: color }}
          title="点击切换颜色"
          aria-label="切换颜色"
        />
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKey}
          placeholder="快速添加今日备忘，回车保存…"
          disabled={submitting}
          className="flex-1 border-0 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={submitting || !title.trim()}
          className="flex-shrink-0 rounded-md bg-primary-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? '添加中…' : '添加'}
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto">
        {memos.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">今日暂无备忘，在上方添加一条吧</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {memos.slice(0, 6).map((memo) => (
              <Link
                key={memo.id}
                href="/memos"
                className="block rounded-xl border border-gray-100 p-3 transition-shadow hover:shadow-sm"
                style={{ backgroundColor: memo.color || '#ffffff' }}
              >
                <h4 className="truncate text-sm font-medium text-gray-900">{memo.title}</h4>
                {memo.content && (
                  <p className="mt-1 line-clamp-2 text-xs text-gray-600">{memo.content}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
