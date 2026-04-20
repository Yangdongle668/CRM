'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { COUNTRY_META, type CountryMeta } from '@/lib/constants';

interface CountrySelectProps {
  /** 绑定值：永远是中文名，如 "西班牙"；空串表示未选择。 */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** 允许清空（在 input 右侧出现 X），默认 true。 */
  clearable?: boolean;
  /** 失去焦点且正好命中某国（ISO/英文/中文精确匹配）时自动归一到中文名。 */
  autoResolveOnBlur?: boolean;
}

/**
 * 国家模糊输入框：
 * - 支持中文（如"西"或"西班牙"前缀）、英文（"Spain"）、ISO 代码（"ES"）
 * - 键盘 ↑↓ 选中，Enter 确认，Esc 关闭
 * - 失焦时如果输入刚好命中某国，会自动规范成该国的中文名
 */
export default function CountrySelect({
  value,
  onChange,
  placeholder = '输入国家名/拼音/ISO 代码',
  className = '',
  disabled,
  clearable = true,
  autoResolveOnBlur = true,
}: CountrySelectProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 父组件 value 外部变化时同步
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const computeMatches = useCallback((q: string): CountryMeta[] => {
    const raw = q.trim();
    if (!raw) return COUNTRY_META;
    const lower = raw.toLowerCase();

    // 按匹配质量排序：ISO 精确 > 名/英文 startsWith > 任意 includes
    const codeEq: CountryMeta[] = [];
    const nameStarts: CountryMeta[] = [];
    const enStarts: CountryMeta[] = [];
    const includes: CountryMeta[] = [];

    for (const c of COUNTRY_META) {
      const codeL = c.code.toLowerCase();
      const enL = c.en.toLowerCase();
      if (codeL === lower) {
        codeEq.push(c);
      } else if (c.name.startsWith(raw)) {
        nameStarts.push(c);
      } else if (enL.startsWith(lower)) {
        enStarts.push(c);
      } else if (
        c.name.includes(raw) ||
        enL.includes(lower) ||
        codeL.includes(lower)
      ) {
        includes.push(c);
      }
    }
    const seen = new Set<string>();
    const out: CountryMeta[] = [];
    for (const c of [...codeEq, ...nameStarts, ...enStarts, ...includes]) {
      const key = c.name + '|' + c.code;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
    return out;
  }, []);

  const matches = useMemo(() => computeMatches(query), [query, computeMatches]);

  // 点外面关闭
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        if (autoResolveOnBlur) {
          const top = computeMatches(query)[0];
          // 只有当输入精确匹配某国（中/英/代码）时才规范化，
          // 避免把随手输入的内容替换成最接近的国家。
          if (top && isExactMatch(query, top)) {
            if (top.name !== value) onChange(top.name);
            setQuery(top.name);
          } else if (!query.trim()) {
            if (value) onChange('');
          } else {
            // 恢复为上一次有效值
            setQuery(value);
          }
        }
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, query, value, onChange, autoResolveOnBlur, computeMatches]);

  // 选项列表滚动到选中项
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(
      `[data-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const commit = (c: CountryMeta) => {
    setQuery(c.name);
    onChange(c.name);
    setOpen(false);
    setActiveIdx(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const m = matches[activeIdx];
      if (m) commit(m);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery(value);
    }
  };

  const clear = () => {
    setQuery('');
    onChange('');
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
        autoComplete="off"
      />
      {clearable && query && !disabled && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="清空"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {open && !disabled && matches.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {matches.slice(0, 50).map((c, i) => (
            <li
              key={`${c.code}-${c.name}`}
              data-idx={i}
              role="option"
              aria-selected={i === activeIdx}
              onMouseEnter={() => setActiveIdx(i)}
              // 用 mousedown 避免 input blur 抢先关闭列表
              onMouseDown={(e) => {
                e.preventDefault();
                commit(c);
              }}
              className={`flex cursor-pointer items-center justify-between px-3 py-1.5 text-sm ${
                i === activeIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
              }`}
            >
              <span className="truncate">
                {c.name}
                <span className="ml-2 text-xs text-gray-400">{c.en}</span>
              </span>
              {c.code && (
                <span className="ml-2 flex-shrink-0 rounded bg-gray-100 px-1.5 text-[11px] font-mono font-semibold text-gray-500">
                  {c.code}
                </span>
              )}
            </li>
          ))}
          {matches.length > 50 && (
            <li className="px-3 py-1 text-center text-[11px] text-gray-400">
              继续输入以缩小范围…
            </li>
          )}
        </ul>
      )}

      {open && !disabled && matches.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">
          未找到匹配的国家
        </div>
      )}
    </div>
  );
}

function isExactMatch(q: string, c: CountryMeta): boolean {
  const raw = q.trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return (
    c.name === raw ||
    c.en.toLowerCase() === lower ||
    c.code.toLowerCase() === lower
  );
}
