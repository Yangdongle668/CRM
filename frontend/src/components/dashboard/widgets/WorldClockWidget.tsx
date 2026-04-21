'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineClock,
  HiOutlineXMark,
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineCheck,
  HiOutlineMagnifyingGlass,
} from 'react-icons/hi2';
import { authApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { WidgetProps } from '../types';

/**
 * 单条时区的展示元信息。ianaTz 用作唯一 key；label 是给用户看的
 * 中文名（"北京 / 上海"），region 用来做搜索分组。
 */
interface TzEntry {
  ianaTz: string;
  label: string;
  region: string;
  country?: string;
}

/**
 * 内置城市表。用户常用的国家 / 地区会全覆盖；不在表里的 IANA 区名
 * 也允许通过搜索"其它"直接添加。中文 label 放在前面方便按名字搜。
 */
const TZ_CATALOG: TzEntry[] = [
  // 亚洲
  { ianaTz: 'Asia/Shanghai', label: '北京 / 上海', region: '亚洲', country: '中国' },
  { ianaTz: 'Asia/Hong_Kong', label: '香港', region: '亚洲', country: '中国' },
  { ianaTz: 'Asia/Taipei', label: '台北', region: '亚洲', country: '中国' },
  { ianaTz: 'Asia/Tokyo', label: '东京', region: '亚洲', country: '日本' },
  { ianaTz: 'Asia/Seoul', label: '首尔', region: '亚洲', country: '韩国' },
  { ianaTz: 'Asia/Singapore', label: '新加坡', region: '亚洲', country: '新加坡' },
  { ianaTz: 'Asia/Bangkok', label: '曼谷', region: '亚洲', country: '泰国' },
  { ianaTz: 'Asia/Ho_Chi_Minh', label: '胡志明市', region: '亚洲', country: '越南' },
  { ianaTz: 'Asia/Jakarta', label: '雅加达', region: '亚洲', country: '印度尼西亚' },
  { ianaTz: 'Asia/Manila', label: '马尼拉', region: '亚洲', country: '菲律宾' },
  { ianaTz: 'Asia/Kuala_Lumpur', label: '吉隆坡', region: '亚洲', country: '马来西亚' },
  { ianaTz: 'Asia/Kolkata', label: '新德里 / 孟买', region: '亚洲', country: '印度' },
  { ianaTz: 'Asia/Karachi', label: '卡拉奇', region: '亚洲', country: '巴基斯坦' },
  { ianaTz: 'Asia/Dhaka', label: '达卡', region: '亚洲', country: '孟加拉国' },
  { ianaTz: 'Asia/Almaty', label: '阿拉木图', region: '亚洲', country: '哈萨克斯坦' },

  // 中东
  { ianaTz: 'Asia/Dubai', label: '迪拜', region: '中东', country: '阿联酋' },
  { ianaTz: 'Asia/Riyadh', label: '利雅得', region: '中东', country: '沙特阿拉伯' },
  { ianaTz: 'Asia/Qatar', label: '多哈', region: '中东', country: '卡塔尔' },
  { ianaTz: 'Asia/Kuwait', label: '科威特', region: '中东', country: '科威特' },
  { ianaTz: 'Asia/Tehran', label: '德黑兰', region: '中东', country: '伊朗' },
  { ianaTz: 'Asia/Jerusalem', label: '耶路撒冷', region: '中东', country: '以色列' },
  { ianaTz: 'Asia/Baghdad', label: '巴格达', region: '中东', country: '伊拉克' },
  { ianaTz: 'Asia/Beirut', label: '贝鲁特', region: '中东', country: '黎巴嫩' },
  { ianaTz: 'Europe/Istanbul', label: '伊斯坦布尔', region: '中东', country: '土耳其' },

  // 欧洲
  { ianaTz: 'Europe/London', label: '伦敦', region: '欧洲', country: '英国' },
  { ianaTz: 'Europe/Paris', label: '巴黎', region: '欧洲', country: '法国' },
  { ianaTz: 'Europe/Berlin', label: '柏林', region: '欧洲', country: '德国' },
  { ianaTz: 'Europe/Madrid', label: '马德里', region: '欧洲', country: '西班牙' },
  { ianaTz: 'Europe/Rome', label: '罗马', region: '欧洲', country: '意大利' },
  { ianaTz: 'Europe/Amsterdam', label: '阿姆斯特丹', region: '欧洲', country: '荷兰' },
  { ianaTz: 'Europe/Brussels', label: '布鲁塞尔', region: '欧洲', country: '比利时' },
  { ianaTz: 'Europe/Zurich', label: '苏黎世', region: '欧洲', country: '瑞士' },
  { ianaTz: 'Europe/Vienna', label: '维也纳', region: '欧洲', country: '奥地利' },
  { ianaTz: 'Europe/Stockholm', label: '斯德哥尔摩', region: '欧洲', country: '瑞典' },
  { ianaTz: 'Europe/Oslo', label: '奥斯陆', region: '欧洲', country: '挪威' },
  { ianaTz: 'Europe/Copenhagen', label: '哥本哈根', region: '欧洲', country: '丹麦' },
  { ianaTz: 'Europe/Helsinki', label: '赫尔辛基', region: '欧洲', country: '芬兰' },
  { ianaTz: 'Europe/Warsaw', label: '华沙', region: '欧洲', country: '波兰' },
  { ianaTz: 'Europe/Prague', label: '布拉格', region: '欧洲', country: '捷克' },
  { ianaTz: 'Europe/Moscow', label: '莫斯科', region: '欧洲', country: '俄罗斯' },
  { ianaTz: 'Europe/Athens', label: '雅典', region: '欧洲', country: '希腊' },
  { ianaTz: 'Europe/Lisbon', label: '里斯本', region: '欧洲', country: '葡萄牙' },
  { ianaTz: 'Europe/Dublin', label: '都柏林', region: '欧洲', country: '爱尔兰' },
  { ianaTz: 'Europe/Kiev', label: '基辅', region: '欧洲', country: '乌克兰' },

  // 北美
  { ianaTz: 'America/New_York', label: '纽约', region: '北美', country: '美国' },
  { ianaTz: 'America/Chicago', label: '芝加哥', region: '北美', country: '美国' },
  { ianaTz: 'America/Denver', label: '丹佛', region: '北美', country: '美国' },
  { ianaTz: 'America/Los_Angeles', label: '洛杉矶 / 美国西部', region: '北美', country: '美国' },
  { ianaTz: 'America/Anchorage', label: '安克雷奇', region: '北美', country: '美国' },
  { ianaTz: 'Pacific/Honolulu', label: '檀香山', region: '北美', country: '美国' },
  { ianaTz: 'America/Toronto', label: '多伦多', region: '北美', country: '加拿大' },
  { ianaTz: 'America/Vancouver', label: '温哥华', region: '北美', country: '加拿大' },
  { ianaTz: 'America/Mexico_City', label: '墨西哥城', region: '北美', country: '墨西哥' },

  // 南美
  { ianaTz: 'America/Sao_Paulo', label: '圣保罗', region: '南美', country: '巴西' },
  { ianaTz: 'America/Bogota', label: '波哥大', region: '南美', country: '哥伦比亚' },
  { ianaTz: 'America/Buenos_Aires', label: '布宜诺斯艾利斯', region: '南美', country: '阿根廷' },
  { ianaTz: 'America/Lima', label: '利马', region: '南美', country: '秘鲁' },
  { ianaTz: 'America/Santiago', label: '圣地亚哥', region: '南美', country: '智利' },
  { ianaTz: 'America/Caracas', label: '加拉加斯', region: '南美', country: '委内瑞拉' },

  // 非洲
  { ianaTz: 'Africa/Cairo', label: '开罗', region: '非洲', country: '埃及' },
  { ianaTz: 'Africa/Johannesburg', label: '约翰内斯堡', region: '非洲', country: '南非' },
  { ianaTz: 'Africa/Lagos', label: '拉各斯', region: '非洲', country: '尼日利亚' },
  { ianaTz: 'Africa/Nairobi', label: '内罗毕', region: '非洲', country: '肯尼亚' },
  { ianaTz: 'Africa/Casablanca', label: '卡萨布兰卡', region: '非洲', country: '摩洛哥' },
  { ianaTz: 'Africa/Addis_Ababa', label: '亚的斯亚贝巴', region: '非洲', country: '埃塞俄比亚' },
  { ianaTz: 'Africa/Algiers', label: '阿尔及尔', region: '非洲', country: '阿尔及利亚' },

  // 大洋洲
  { ianaTz: 'Australia/Sydney', label: '悉尼', region: '大洋洲', country: '澳大利亚' },
  { ianaTz: 'Australia/Melbourne', label: '墨尔本', region: '大洋洲', country: '澳大利亚' },
  { ianaTz: 'Australia/Perth', label: '珀斯', region: '大洋洲', country: '澳大利亚' },
  { ianaTz: 'Australia/Brisbane', label: '布里斯班', region: '大洋洲', country: '澳大利亚' },
  { ianaTz: 'Pacific/Auckland', label: '奥克兰', region: '大洋洲', country: '新西兰' },
  { ianaTz: 'Pacific/Fiji', label: '苏瓦', region: '大洋洲', country: '斐济' },
];

const REGION_ORDER = ['亚洲', '中东', '欧洲', '北美', '南美', '非洲', '大洋洲', '其它'];

export const DEFAULT_WORLD_CLOCK_TIMEZONES = [
  'Asia/Shanghai',
  'America/Los_Angeles',
  'Europe/Berlin',
];

/**
 * 找到 IANA 区名对应的展示元信息；如果不在预置表里，回退到用区名
 * 自己派生一份（比如 "Europe/Kaliningrad" → label "Kaliningrad"）。
 */
function describeTz(ianaTz: string): TzEntry {
  const hit = TZ_CATALOG.find((t) => t.ianaTz === ianaTz);
  if (hit) return hit;
  const tail = ianaTz.split('/').pop() || ianaTz;
  return {
    ianaTz,
    label: tail.replace(/_/g, ' '),
    region: '其它',
  };
}

/**
 * 用 Intl.DateTimeFormat 的 formatToParts 取出指定时区的 年/月/日/时/分/秒/星期，
 * 保证显示与浏览器本地时区解耦（而不是用 toLocaleString 拿整串再去解析）。
 */
function getPartsInTz(now: Date, tz: string) {
  try {
    const fmt = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
      second: get('second'),
      weekday: get('weekday'),
    };
  } catch {
    // 某些浏览器可能不认得新的 tz 名，回退到本地时间，不至于整块崩。
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      year: String(now.getFullYear()),
      month: pad(now.getMonth() + 1),
      day: pad(now.getDate()),
      hour: pad(now.getHours()),
      minute: pad(now.getMinutes()),
      second: pad(now.getSeconds()),
      weekday: '',
    };
  }
}

/**
 * 拿到"目标时区相对 UTC 的偏移量（分钟，东为正）"。
 * Intl 没有直接 API，这里用标志时间戳配合 formatToParts 反推。
 */
function getTzOffsetMinutes(now: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
    // 注意：Intl 在凌晨 24:00 上会输出 "24"，这里用 Date.UTC 相减即可正确处理。
    const asUTC = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') === 24 ? 0 : get('hour'),
      get('minute'),
      get('second'),
    );
    return Math.round((asUTC - now.getTime()) / 60000);
  } catch {
    return -now.getTimezoneOffset();
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

// ============================================================
// 单条时钟
// ============================================================

interface ClockRowProps {
  entry: TzEntry;
  now: Date;
  editing: boolean;
  onRemove: () => void;
}

function ClockRow({ entry, now, editing, onRemove }: ClockRowProps) {
  const p = getPartsInTz(now, entry.ianaTz);
  const offset = getTzOffsetMinutes(now, entry.ianaTz);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 transition-colors hover:bg-gray-100/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium text-gray-800">{entry.label}</p>
          <span className="flex-shrink-0 text-[10px] text-gray-400">{formatOffset(offset)}</span>
        </div>
        <p className="truncate text-[11px] text-gray-500">
          {p.year}-{p.month}-{p.day}
          {p.weekday ? ` · ${p.weekday}` : ''}
        </p>
      </div>
      <div className="flex-shrink-0 font-mono text-lg font-semibold tracking-wider text-gray-900 tabular-nums">
        {p.hour}
        <span className="mx-0.5 animate-pulse text-gray-400">:</span>
        {p.minute}
        <span className="mx-0.5 animate-pulse text-gray-400">:</span>
        {p.second}
      </div>
      {editing && (
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          title="移除"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

// ============================================================
// 时区选择弹层
// ============================================================

interface TzPickerProps {
  selectedIds: Set<string>;
  onPick: (ianaTz: string) => void;
  onClose: () => void;
}

function TzPicker({ selectedIds, onPick, onClose }: TzPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TZ_CATALOG;
    return TZ_CATALOG.filter((t) => {
      return (
        t.label.toLowerCase().includes(q) ||
        t.ianaTz.toLowerCase().includes(q) ||
        (t.country || '').toLowerCase().includes(q) ||
        t.region.toLowerCase().includes(q)
      );
    });
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, TzEntry[]>();
    for (const t of filtered) {
      const arr = map.get(t.region) || [];
      arr.push(t);
      map.set(t.region, arr);
    }
    return REGION_ORDER
      .filter((r) => map.has(r))
      .map((r) => ({ region: r, items: map.get(r)! }));
  }, [filtered]);

  return (
    <div className="mb-3 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
        <HiOutlineMagnifyingGlass className="h-4 w-4 text-gray-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索城市 / 国家 / 时区（例：柏林、巴西、Tokyo）"
          className="flex-1 border-none bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="关闭"
        >
          <HiOutlineXMark className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto px-2 py-2">
        {grouped.length === 0 ? (
          <p className="py-6 text-center text-xs text-gray-400">没有匹配的时区</p>
        ) : (
          grouped.map(({ region, items }) => (
            <div key={region} className="mb-2 last:mb-0">
              <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                {region}
              </p>
              <div className="grid grid-cols-2 gap-1">
                {items.map((t) => {
                  const picked = selectedIds.has(t.ianaTz);
                  return (
                    <button
                      key={t.ianaTz}
                      type="button"
                      disabled={picked}
                      onClick={() => onPick(t.ianaTz)}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        picked
                          ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-400'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700'
                      }`}
                    >
                      <span className="truncate">
                        <span className="font-medium">{t.label}</span>
                        {t.country && (
                          <span className="ml-1 text-[10px] text-gray-400">· {t.country}</span>
                        )}
                      </span>
                      {picked && (
                        <HiOutlineCheck className="ml-1 h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// 主 Widget
// ============================================================

export function WorldClockWidget(_props: WidgetProps) {
  const { user } = useAuth();

  const initial = useMemo<string[]>(() => {
    const saved = (user as any)?.preferences?.worldClockTimezones;
    if (Array.isArray(saved) && saved.every((s) => typeof s === 'string') && saved.length > 0) {
      return saved;
    }
    return DEFAULT_WORLD_CLOCK_TIMEZONES;
  }, [user]);

  const [tzs, setTzs] = useState<string[]>(initial);
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  // 每秒一次的 tick。这里刻意用一个轻量 state，只变 Date 实例，让
  // ClockRow 的格式化串自然更新；不要靠外层其它状态来触发重渲染。
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 保存偏好：节流 500ms，避免快速增删时刷爆 /auth/profile。
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback((next: string[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      authApi.updatePreferences({ worldClockTimezones: next }).catch(() => {
        /* 偏好保存失败不影响前端本地体验 */
      });
    }, 500);
  }, []);

  const addTz = useCallback(
    (ianaTz: string) => {
      setTzs((prev) => {
        if (prev.includes(ianaTz)) return prev;
        const next = [...prev, ianaTz];
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const removeTz = useCallback(
    (ianaTz: string) => {
      setTzs((prev) => {
        const next = prev.filter((x) => x !== ianaTz);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const selectedIds = useMemo(() => new Set(tzs), [tzs]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          {tzs.length > 0 ? `${tzs.length} 个时区` : '尚未添加时区'}
        </span>
        <div className="flex items-center gap-1">
          {editing && (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary-400 bg-white px-2 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-50"
            >
              <HiOutlinePlus className="h-3.5 w-3.5" />
              添加
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setEditing((v) => !v);
              setPicking(false);
            }}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
              editing
                ? 'bg-primary-500 text-white hover:bg-primary-600'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {editing ? (
              <>
                <HiOutlineCheck className="h-3.5 w-3.5" />
                完成
              </>
            ) : (
              <>
                <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                编辑
              </>
            )}
          </button>
        </div>
      </div>

      {editing && picking && (
        <TzPicker
          selectedIds={selectedIds}
          onPick={(id) => {
            addTz(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {tzs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
          <HiOutlineClock className="mb-2 h-10 w-10 opacity-40" />
          <p className="text-sm">点击"编辑"添加一个时区</p>
        </div>
      ) : (
        <ul className="flex-1 space-y-1.5 overflow-y-auto">
          {tzs.map((id) => (
            <ClockRow
              key={id}
              entry={describeTz(id)}
              now={now}
              editing={editing}
              onRemove={() => removeTz(id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
