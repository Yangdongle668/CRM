'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineCog6Tooth, HiOutlineCheck } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { ratesApi, authApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

interface AvailableCcy {
  code: string;
  nameZh: string;
}

interface RatesData {
  base: string;
  source?: string;
  updatedAt: string;
  rates: Record<string, number>;
  available?: AvailableCcy[];
}

const SOURCE_LABEL: Record<string, string> = {
  BOC: '中国银行外汇牌价',
  loading: '加载中',
};

// 给最多 5 个 pill 分配区分度足够的颜色（沿用原 USD = 蓝、EUR = 靛 的冷色调，
// 后面几位顺延紫 / 青绿 / 粉，仍偏冷，整体不打破现有视觉）。按 pill 索引取色，
// 不和币种绑定——用户改了显示哪几个币也不会突兀地变色。
const PILL_COLORS = [
  'bg-blue-50 text-blue-700',
  'bg-indigo-50 text-indigo-700',
  'bg-violet-50 text-violet-700',
  'bg-teal-50 text-teal-700',
  'bg-rose-50 text-rose-700',
];

const DEFAULT_CCYS = ['USD', 'EUR'];
const MIN_CCYS = 2;
// 桌面端最多 5 个；手机端用 CSS 把第 3 个起隐藏掉，最多看到 2 个，
// 不挡顶栏的其它按钮。
const MAX_CCYS = 5;
const MOBILE_VISIBLE = 2;

export default function ExchangeRates() {
  const { user, refreshUser } = useAuth();
  const [data, setData] = useState<RatesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const fetchRates = useCallback(async () => {
    try {
      const res: any = await ratesApi.get();
      setData(res.data);
    } catch {
      // 静默：可选 widget
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchRates]);

  // 用户偏好：要显示哪几个币种，最少 2 最多 3 个
  const selectedCcys = useMemo<string[]>(() => {
    const fromUser = (user as any)?.preferences?.exchangeRateCurrencies;
    if (Array.isArray(fromUser) && fromUser.length >= MIN_CCYS) {
      return fromUser.slice(0, MAX_CCYS);
    }
    return DEFAULT_CCYS;
  }, [user]);

  // 点外部关闭编辑面板
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setEditorOpen(false);
      }
    };
    if (editorOpen) document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editorOpen]);

  const openEditor = () => {
    setDraftSelected(selectedCcys);
    setEditorOpen(true);
  };

  const toggleDraft = (code: string) => {
    setDraftSelected((prev) => {
      if (prev.includes(code)) {
        // 取消勾选；少于最小数禁止，提示一下
        if (prev.length <= MIN_CCYS) {
          toast.error(`至少要保留 ${MIN_CCYS} 个货币`);
          return prev;
        }
        return prev.filter((c) => c !== code);
      }
      if (prev.length >= MAX_CCYS) {
        toast.error(`最多显示 ${MAX_CCYS} 个货币`);
        return prev;
      }
      return [...prev, code];
    });
  };

  const saveDraft = async () => {
    if (draftSelected.length < MIN_CCYS) {
      toast.error(`至少要保留 ${MIN_CCYS} 个货币`);
      return;
    }
    setSaving(true);
    try {
      await authApi.updatePreferences({
        exchangeRateCurrencies: draftSelected.slice(0, MAX_CCYS),
      });
      await refreshUser?.();
      setEditorOpen(false);
      toast.success('汇率显示已更新');
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[ExchangeRates] save failed', err);
      const msg = err?.response?.data?.message || err?.message || '保存失败';
      toast.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-gray-300 border-t-transparent" />
        <span>汇率加载中</span>
      </div>
    );
  }

  if (!data || !data.rates?.USD_CNY) {
    return null;
  }

  const updatedAt = new Date(data.updatedAt);
  const timeStr = updatedAt.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const sourceLabel = data.source ? SOURCE_LABEL[data.source] || data.source : '';
  const tipPrefix = sourceLabel ? `${sourceLabel} · ` : '';

  // 真正可显示的 pill：用户选了但服务端没数据的（罕见——某次解析失败）跳过
  const visiblePills = selectedCcys
    .map((code) => ({ code, rate: data.rates[`${code}_CNY`] }))
    .filter((p) => Number.isFinite(p.rate) && p.rate > 0);

  // 编辑面板里的候选项：服务端 available 列表，没数据的灰掉
  const availableList: AvailableCcy[] = data.available && data.available.length > 0
    ? data.available
    : Object.keys(data.rates)
        .filter((k) => k.endsWith('_CNY'))
        .map((k) => ({ code: k.replace('_CNY', ''), nameZh: k.replace('_CNY', '') }));

  return (
    <div ref={wrapRef} className="relative flex items-center gap-3 text-xs font-medium text-gray-600">
      <div className="flex items-center gap-3" title={`${tipPrefix}更新于 ${timeStr}（每 15 分钟自动刷新）`}>
        {visiblePills.map((p, i) => {
          // 手机端只显示前 MOBILE_VISIBLE 个 pill，避免和顶栏其它按钮挤
          // 在一行；桌面端 (md ↑) 全部显示。
          const hideOnMobile = i >= MOBILE_VISIBLE;
          return (
            <div
              key={p.code}
              className={`${hideOnMobile ? 'hidden md:flex' : 'flex'} items-center gap-1.5 px-2.5 py-1 rounded-full ${
                PILL_COLORS[i % PILL_COLORS.length]
              }`}
            >
              <span className="text-[10px] font-bold tracking-wide">{p.code}</span>
              <span className="text-gray-400">→</span>
              <span>¥ {Number(p.rate).toFixed(4)}</span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={openEditor}
        title="编辑汇率显示"
        className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
      >
        <HiOutlineCog6Tooth className="h-4 w-4" />
      </button>

      {editorOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-gray-800">显示哪些汇率</span>
            <span className="text-[11px] text-gray-400">
              {draftSelected.length} / {MAX_CCYS}（最少 {MIN_CCYS}）
            </span>
          </div>
          <p className="mb-2 text-[11px] text-gray-400">
            桌面端最多显示 {MAX_CCYS} 个；手机端仅显示前 {MOBILE_VISIBLE} 个。
          </p>
          <div className="max-h-56 overflow-y-auto pr-1">
            {availableList.map((c) => {
              const checked = draftSelected.includes(c.code);
              const hasRate = Number.isFinite(data.rates[`${c.code}_CNY`]) && data.rates[`${c.code}_CNY`] > 0;
              return (
                <label
                  key={c.code}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] ${
                    hasRate ? 'cursor-pointer hover:bg-blue-50/40' : 'opacity-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={checked}
                      disabled={!hasRate}
                      onChange={() => toggleDraft(c.code)}
                    />
                    <span className="font-medium text-gray-800">{c.code}</span>
                    <span className="text-gray-500">{c.nameZh}</span>
                  </span>
                  {hasRate && (
                    <span className="tabular-nums text-gray-500">
                      ¥ {data.rates[`${c.code}_CNY`].toFixed(2)}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
              className="rounded-lg px-2 py-1 text-[12px] text-gray-500 hover:bg-gray-100"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <HiOutlineCheck className="h-3.5 w-3.5" />
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
