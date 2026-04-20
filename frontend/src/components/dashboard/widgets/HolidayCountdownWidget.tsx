'use client';

import React, { useMemo } from 'react';
import { HiOutlineCalendarDays, HiOutlineLightBulb } from 'react-icons/hi2';
import {
  getUpcomingHolidays,
  HOLIDAY_TYPE_LABEL,
  HOLIDAY_TYPE_STYLE,
} from '@/lib/holiday-reminders';
import type { WidgetProps } from '../types';

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

export function HolidayCountdownWidget(_props: WidgetProps) {
  const items = useMemo(() => getUpcomingHolidays(60).slice(0, 6), []);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <HiOutlineCalendarDays className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">未来 60 天内没有节日</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const { holiday, date, daysUntil, businessNote } = item;
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const w = WEEKDAY_CN[date.getDay()];

        const countdownText =
          daysUntil === 0 ? '今天' : daysUntil === 1 ? '明天' : `${daysUntil} 天后`;
        const urgent = daysUntil <= 7;

        return (
          <li
            key={`${holiday.date}-${holiday.name}`}
            className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 hover:bg-gray-100/60 transition-colors"
          >
            <div className="flex-shrink-0 w-12 text-center">
              <div className="text-[10px] text-gray-400">{m} 月</div>
              <div className="text-xl font-bold text-gray-800 leading-tight">{d}</div>
              <div className="text-[10px] text-gray-400">周{w}</div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {holiday.name}
                </span>
                <span
                  className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
                    HOLIDAY_TYPE_STYLE[holiday.type] || 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {HOLIDAY_TYPE_LABEL[holiday.type] || holiday.type}
                </span>
              </div>
              {businessNote && (
                <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-700">
                  <HiOutlineLightBulb className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span className="leading-tight">{businessNote}</span>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 text-right">
              <span
                className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                  urgent
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {countdownText}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
