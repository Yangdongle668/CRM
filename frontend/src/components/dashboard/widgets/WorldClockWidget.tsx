'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { WidgetProps } from '../types';

const STORAGE_KEY = 'world-clock:zones';

interface TZEntry {
  label: string;
  tz: string;
}

const PRESETS: TZEntry[] = [
  { label: '北京', tz: 'Asia/Shanghai' },
  { label: '纽约', tz: 'America/New_York' },
  { label: '洛杉矶', tz: 'America/Los_Angeles' },
  { label: '伦敦', tz: 'Europe/London' },
  { label: '法兰克福', tz: 'Europe/Berlin' },
  { label: '迪拜', tz: 'Asia/Dubai' },
  { label: '东京', tz: 'Asia/Tokyo' },
  { label: '悉尼', tz: 'Australia/Sydney' },
  { label: '新加坡', tz: 'Asia/Singapore' },
  { label: '首尔', tz: 'Asia/Seoul' },
  { label: '孟买', tz: 'Asia/Kolkata' },
  { label: '圣保罗', tz: 'America/Sao_Paulo' },
];

const DEFAULT_ZONES: TZEntry[] = [
  { label: '北京', tz: 'Asia/Shanghai' },
  { label: '纽约', tz: 'America/New_York' },
  { label: '伦敦', tz: 'Europe/London' },
];

const stopDrag = {
  onMouseDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation(),
  onTouchStart: (e: React.SyntheticEvent) => e.stopPropagation(),
};

function formatClock(tz: string): { time: string; date: string; offset: string } {
  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const date = now.toLocaleDateString('zh-CN', { timeZone: tz, month: '2-digit', day: '2-digit', weekday: 'short' });
  const offsetMin = -new Date(now.toLocaleString('en-US', { timeZone: tz })).getTimezoneOffset?.() || 0;

  // Calculate UTC offset by comparing local time in that zone with UTC
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
  const tzStr = now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const utcH = parseInt(utcStr.split(':')[0]);
  const tzH = parseInt(tzStr.split(':')[0]);
  let diff = tzH - utcH;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  const sign = diff >= 0 ? '+' : '-';
  const absDiff = Math.abs(diff);
  const offset = `UTC${sign}${absDiff}`;

  return { time, date, offset };
}

function loadZones(): TZEntry[] {
  if (typeof window === 'undefined') return DEFAULT_ZONES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_ZONES;
}

export function WorldClockWidget(_props: WidgetProps) {
  const [zones, setZones] = useState<TZEntry[]>(DEFAULT_ZONES);
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TZEntry[]>(DEFAULT_ZONES);
  const [customLabel, setCustomLabel] = useState('');
  const [customTz, setCustomTz] = useState('');
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    setZones(loadZones());
    setDraft(loadZones());
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const openEdit = () => {
    setDraft([...zones]);
    setCustomLabel('');
    setCustomTz('');
    setCustomError('');
    setEditing(true);
  };

  const saveEdit = () => {
    setZones(draft);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const removeZone = (idx: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const addPreset = (entry: TZEntry) => {
    if (draft.some((z) => z.tz === entry.tz)) return;
    setDraft((prev) => [...prev, entry]);
  };

  const addCustom = () => {
    const label = customLabel.trim();
    const tz = customTz.trim();
    if (!label || !tz) {
      setCustomError('请填写名称和时区');
      return;
    }
    try {
      new Date().toLocaleString('en-US', { timeZone: tz });
    } catch {
      setCustomError('无效的时区标识符（如 Asia/Tokyo）');
      return;
    }
    if (draft.some((z) => z.tz === tz)) {
      setCustomError('该时区已存在');
      return;
    }
    setDraft((prev) => [...prev, { label, tz }]);
    setCustomLabel('');
    setCustomTz('');
    setCustomError('');
  };

  if (editing) {
    return (
      <div className="flex h-full flex-col gap-3" {...stopDrag}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">编辑时区</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-md border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 transition"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-md bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700 transition"
            >
              保存
            </button>
          </div>
        </div>

        {/* Current zones */}
        <div className="flex flex-wrap gap-2">
          {draft.map((z, i) => (
            <div key={z.tz} className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs">
              <span className="text-gray-700">{z.label}</span>
              <button
                type="button"
                onClick={() => removeZone(i)}
                className="text-gray-400 hover:text-red-500 transition"
                aria-label="移除"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Presets */}
        <div>
          <p className="text-xs text-gray-500 mb-1.5">快速添加：</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.filter((p) => !draft.some((z) => z.tz === p.tz)).map((p) => (
              <button
                key={p.tz}
                type="button"
                onClick={() => addPreset(p)}
                className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition"
              >
                + {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom timezone */}
        <div className="flex items-center gap-2">
          <input
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="城市名"
            className="w-20 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-primary-300"
          />
          <input
            value={customTz}
            onChange={(e) => setCustomTz(e.target.value)}
            placeholder="Asia/Tokyo"
            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-primary-300 font-mono"
          />
          <button
            type="button"
            onClick={addCustom}
            className="rounded-md bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200 transition whitespace-nowrap"
          >
            添加
          </button>
        </div>
        {customError && <p className="text-xs text-red-500">{customError}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        <button
          type="button"
          onClick={openEdit}
          className="text-xs text-gray-400 hover:text-gray-700 transition px-1.5 py-0.5 rounded hover:bg-gray-100"
          {...stopDrag}
        >
          编辑时区
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
          {zones.map((z) => {
            const { time, date, offset } = formatClock(z.tz);
            return (
              <div
                key={z.tz}
                className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-medium text-gray-500">{z.label}</div>
                    <div className="mt-0.5 text-xl font-bold tabular-nums text-gray-900 tracking-tight">{time}</div>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-gray-50 rounded px-1.5 py-0.5 border border-gray-100 font-mono mt-0.5">{offset}</span>
                </div>
                <div className="mt-1 text-xs text-gray-400">{date}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
