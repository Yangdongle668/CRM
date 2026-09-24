'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';
import { customersApi } from '@/lib/api';

interface Props {
  value: string; // customerId，空串表示不关联
  onChange: (id: string) => void;
}

/**
 * 写信时关联客户：输入公司名远程搜索。
 *
 * 以前是一个 <select>，页面打开时一次性加载 200 个客户，客户多了后面的
 * 根本选不到。
 */
export default function CustomerPicker({ value, onChange }: Props) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; companyName: string }>>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 外部预填了 customerId（回复客户来信、打开草稿）时补上公司名
  useEffect(() => {
    if (!value) {
      setName('');
      return;
    }
    let cancelled = false;
    customersApi
      .getById(value)
      .then((res: any) => {
        if (!cancelled) setName(res.data?.companyName || '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res: any = await customersApi.list({ page: 1, pageSize: 20, search: q || undefined });
        setResults(Array.isArray(res.data?.items) ? res.data.items : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (value && !open) {
    return (
      <div className="flex flex-1 items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
          className="truncate rounded bg-blue-50 px-2 py-0.5 text-sm text-blue-700 hover:bg-blue-100"
          title="更换客户"
        >
          {name || '已关联客户'}
        </button>
        <button
          type="button"
          onClick={() => onChange('')}
          className="rounded p-0.5 text-gray-400 hover:text-red-500"
          title="取消关联"
        >
          <HiOutlineXMark className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative flex-1">
      <input
        type="text"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="不关联客户（输入公司名搜索）"
        className="w-full border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
      />
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 max-h-60 w-full max-w-md overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">搜索中…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">没有匹配的客户</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c.id);
                  setName(c.companyName);
                  setOpen(false);
                  setQuery('');
                }}
                className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                {c.companyName}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
