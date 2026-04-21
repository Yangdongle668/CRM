'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HiOutlineSearch, HiOutlineX } from 'react-icons/hi';
import { searchApi, type SearchGroup, type SearchType } from '@/lib/api';

const TYPE_LABELS: Record<SearchType, string> = {
  customer: '客户',
  lead: '线索',
  order: '订单',
  email: '邮件',
};

const TYPE_COLORS: Record<SearchType, string> = {
  customer: 'bg-blue-50 text-blue-700',
  lead: 'bg-purple-50 text-purple-700',
  order: 'bg-emerald-50 text-emerald-700',
  email: 'bg-amber-50 text-amber-700',
};

function hitHref(type: SearchType, id: string): string {
  switch (type) {
    case 'customer':
      return `/customers/${id}`;
    case 'lead':
      return `/leads?highlight=${id}`;
    case 'order':
      return `/orders?highlight=${id}`;
    case 'email':
      return `/emails?id=${id}`;
  }
}

/**
 * 把后端返回的 "{{MARK}}xxx{{/MARK}}" 标记替换为高亮节点。
 */
function renderHighlighted(snippet?: string): React.ReactNode {
  if (!snippet) return null;
  const regex = /\{\{MARK\}\}([\s\S]*?)\{\{\/MARK\}\}/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(snippet)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(snippet.slice(lastIndex, match.index));
    }
    nodes.push(
      <mark
        key={`m-${key++}`}
        className="bg-yellow-200 text-gray-900 rounded px-0.5"
      >
        {match[1]}
      </mark>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < snippet.length) {
    nodes.push(snippet.slice(lastIndex));
  }
  return nodes;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 扁平化所有 hit，便于键盘导航
  const flatHits = useMemo(
    () =>
      results.flatMap((g) =>
        g.hits.map((h) => ({ type: g.type, hit: h })),
      ),
    [results],
  );

  // 防抖搜索
  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await searchApi.global({ q, limit: 5 });
        setResults(data);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // ⌘K / Ctrl+K 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goTo = useCallback(
    (type: SearchType, id: string) => {
      router.push(hitHref(type, id));
      setOpen(false);
      setQuery('');
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!flatHits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatHits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flatHits.length) % flatHits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const active = flatHits[activeIdx];
      if (active) goTo(active.type, active.hit.id);
    }
  };

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="relative">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="搜索客户、线索、订单、邮件…"
          className="w-full pl-9 pr-16 py-1.5 text-sm rounded-lg bg-gray-100/70 border border-transparent
                     focus:bg-white focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-100
                     transition placeholder:text-gray-400"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {query ? (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-0.5 rounded hover:bg-gray-200 text-gray-400"
              aria-label="清空"
            >
              <HiOutlineX className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden md:inline-flex items-center gap-0.5 text-[10px] text-gray-400 font-mono bg-white border border-gray-200 rounded px-1.5 py-0.5">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      {open && query.trim() && (
        <div
          className="absolute top-full mt-2 right-0 w-[420px] bg-white rounded-xl shadow-2xl
                     border border-gray-200/80 z-50 max-h-[70vh] overflow-y-auto"
        >
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              搜索中…
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              无匹配结果
            </div>
          )}

          {!loading &&
            results.map((group) => {
              const groupStartIdx = flatHits.findIndex(
                (h) => h.type === group.type,
              );
              return (
                <div key={group.type} className="py-1">
                  <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                    {TYPE_LABELS[group.type]}
                  </div>
                  {group.hits.map((hit, i) => {
                    const globalIdx = groupStartIdx + i;
                    const isActive = globalIdx === activeIdx;
                    return (
                      <button
                        key={hit.id}
                        onMouseEnter={() => setActiveIdx(globalIdx)}
                        onClick={() => goTo(group.type, hit.id)}
                        className={`w-full text-left px-4 py-2.5 transition ${
                          isActive ? 'bg-primary-50/70' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              TYPE_COLORS[group.type]
                            }`}
                          >
                            {TYPE_LABELS[group.type]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {hit.title}
                            </div>
                            {hit.subtitle && (
                              <div className="text-xs text-gray-500 truncate mt-0.5">
                                {hit.subtitle}
                              </div>
                            )}
                            {hit.snippet && (
                              <div className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                                {renderHighlighted(hit.snippet)}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
