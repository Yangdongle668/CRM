/**
 * 温度系统 —— 基于 holidays.ts 的上层辅助，给出：
 * - 今日节日（问候语用）
 * - 未来 N 天内的节日列表（倒计时小组件用）
 * - 针对外贸场景的"业务提示"（工厂放假、欧美圣诞季、欧洲暑假高峰等）
 *
 * 所有数据都是纯计算，无副作用、无网络。
 */

import { ComputedHoliday, getHolidays } from './holidays';

export interface UpcomingHoliday {
  holiday: ComputedHoliday;
  date: Date;
  daysUntil: number;
  /** 针对当前身份（外贸业务）的提示语，无则不显示 */
  businessNote?: string;
}

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 今日节日 —— 按名字去重（春节展开成 7 天在这里只算一条）
 */
export function getTodayHolidays(now: Date = new Date()): ComputedHoliday[] {
  const todayStr = formatDateStr(now);
  const all = getHolidays(now.getFullYear());
  const seen = new Set<string>();
  const result: ComputedHoliday[] = [];
  for (const h of all) {
    if (h.date !== todayStr) continue;
    if (seen.has(h.name)) continue;
    seen.add(h.name);
    result.push(h);
  }
  return result;
}

/**
 * 未来 daysAhead 天内的节日（按日期升序，按名字去重，跨年自动处理）。
 * "春节"这种 7 天连休只保留首日（正月初一）。
 */
export function getUpcomingHolidays(
  daysAhead: number = 60,
  now: Date = new Date(),
): UpcomingHoliday[] {
  const today = startOfDay(now);
  const all = [...getHolidays(now.getFullYear()), ...getHolidays(now.getFullYear() + 1)];

  const seenByName = new Map<string, UpcomingHoliday>();

  for (const h of all) {
    const d = parseDateOnly(h.date);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff < 0 || diff > daysAhead) continue;

    // 同一个名字只保留最近的一次（跨年时避免把明年的也列进来）
    const key = h.name === '春节假期' ? '春节' : h.name;
    const existing = seenByName.get(key);
    if (existing && existing.daysUntil <= diff) continue;

    seenByName.set(key, {
      holiday: h,
      date: d,
      daysUntil: diff,
      businessNote: getBusinessNote(h, diff),
    });
  }

  return Array.from(seenByName.values()).sort((a, b) => a.daysUntil - b.daysUntil);
}

function getBusinessNote(h: ComputedHoliday, daysUntil: number): string | undefined {
  if (h.name === '春节' && daysUntil >= 3 && daysUntil <= 21) {
    return '工厂即将放假 7 天，请提前通知客户货期';
  }
  if (h.name === '除夕' && daysUntil <= 7 && daysUntil >= 0) {
    return '春节连休即将开始';
  }
  if (h.name === '国庆节' && daysUntil >= 3 && daysUntil <= 21) {
    return '国庆 7 天长假，注意排期';
  }
  if (h.name === '中秋节' && daysUntil >= 3 && daysUntil <= 14) {
    return '可提前向华人客户送上祝福';
  }
  if ((h.name.includes('圣诞') || h.name.includes('平安夜')) && daysUntil <= 21) {
    return '欧美客户进入节日季，业务节奏放缓';
  }
  if (h.name === '感恩节' && daysUntil <= 14) {
    return '美国客户陆续休假';
  }
  if ((h.name.includes('复活节') || h.name.includes('耶稣受难日')) && daysUntil <= 10) {
    return '欧洲多国放假';
  }
  if ((h.name.includes('耶稣升天') || h.name.includes('圣灵降临') || h.name === '五旬节') && daysUntil <= 7) {
    return '德/法/北欧放假';
  }
  if ((h.name === '元旦' || h.name === '新年') && daysUntil <= 14 && daysUntil >= 1) {
    return '全球多数地区放假';
  }
  return undefined;
}

/** 欧洲暑假高峰（7-8 月）—— 外贸通用提醒 */
export function isEUSummerPeak(now: Date = new Date()): boolean {
  const m = now.getMonth();
  return m === 6 || m === 7;
}

/** 节日类型 → 中文分类名（给 Widget 的彩色徽章用） */
export const HOLIDAY_TYPE_LABEL: Record<string, string> = {
  CN: '中国法定',
  CN_TRAD: '中国传统',
  INTL: '国际',
  EU: '欧洲',
  IN: '印度',
};

export const HOLIDAY_TYPE_STYLE: Record<string, string> = {
  CN: 'bg-red-100 text-red-700',
  CN_TRAD: 'bg-amber-100 text-amber-700',
  INTL: 'bg-indigo-100 text-indigo-700',
  EU: 'bg-sky-100 text-sky-700',
  IN: 'bg-orange-100 text-orange-700',
};
