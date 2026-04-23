'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { emailsApi } from '@/lib/api';

interface Suggestion {
  email: string;
  name: string | null;
  lastActivity: string | null;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** 套在 input 上的 className，用来沿用 ComposeWindow 原有的无边框样式 */
  inputClassName?: string;
  onBlur?: () => void;
}

/**
 * 把 "seg1, seg2, partial" 这种 value 拆成 [已完成段, 正在输入的段]。
 * 只对最后一段做补全，保留前面已经填好的地址不动。
 */
function splitLastSegment(value: string): { prefix: string; current: string } {
  const idx = value.lastIndexOf(',');
  if (idx < 0) return { prefix: '', current: value };
  return {
    prefix: value.slice(0, idx + 1), // 含逗号
    current: value.slice(idx + 1),
  };
}

function formatAddress(s: Suggestion): string {
  if (s.name && s.name.trim()) {
    // 姓名里若含逗号 / 引号，RFC 要求加引号。简单做法：统一加双引号。
    const safeName = /[,"<>]/.test(s.name) ? `"${s.name.replace(/"/g, '\\"')}"` : s.name;
    return `${safeName} <${s.email}>`;
  }
  return s.email;
}

export default function AddressAutocomplete({
  value,
  onChange,
  placeholder,
  inputClassName,
  onBlur,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqSeq = useRef(0);

  const { current } = splitLastSegment(value);
  const query = current.trim();

  // 查询：防抖 200ms，仅对最后一段触发
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query) {
      setItems([]);
      setOpen(false);
      return;
    }
    const mySeq = ++reqSeq.current;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res: any = await emailsApi.suggestAddresses(query, 15);
        // 只有最新一次请求的结果才 apply，避免抖动
        if (mySeq !== reqSeq.current) return;
        const list: Suggestion[] = Array.isArray(res?.data) ? res.data : [];
        setItems(list);
        setActiveIdx(0);
        setOpen(list.length > 0);
      } catch {
        if (mySeq === reqSeq.current) {
          setItems([]);
          setOpen(false);
        }
      } finally {
        if (mySeq === reqSeq.current) setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // 点击外面关闭下拉
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const commit = useCallback(
    (s: Suggestion) => {
      const { prefix } = splitLastSegment(value);
      const addr = formatAddress(s);
      // 自动补一个 ", " 方便继续输入下一个
      const sep = prefix ? ' ' : '';
      onChange(`${prefix}${sep}${addr}, `);
      setOpen(false);
      // 让 input 继续聚焦，便于接着输入下一个地址
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [onChange, value],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // Enter 仅在下拉打开时拦截，避免误触把表单 submit 了。
      e.preventDefault();
      commit(items[activeIdx]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />

      {open && (
        <ul
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur-sm"
          role="listbox"
        >
          {loading && items.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">搜索中…</li>
          )}
          {items.map((s, i) => {
            const active = i === activeIdx;
            return (
              <li
                key={s.email}
                role="option"
                aria-selected={active}
                // 用 mousedown 代替 click：input 的 blur 会先触发并清掉下拉，
                // mousedown 在 blur 之前，能拿到选中项。
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(s);
                }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {s.name ? (
                      <>
                        <span className="font-medium">{s.name}</span>
                        <span className="ml-1.5 text-gray-500">&lt;{s.email}&gt;</span>
                      </>
                    ) : (
                      <span>{s.email}</span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
