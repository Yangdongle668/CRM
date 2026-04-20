'use client';

import React, { useMemo } from 'react';
import {
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineSparkles,
  HiOutlineInformationCircle,
  HiOutlineGift,
} from 'react-icons/hi2';
import WeatherCard from '@/components/ui/WeatherCard';
import { getTodayHolidays, isEUSummerPeak } from '@/lib/holiday-reminders';

function getTimeGreeting(hour: number): string {
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '午安';
  if (hour < 18) return '下午好';
  if (hour < 22) return '晚上好';
  return '夜深了';
}

function isSameMonthDay(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

interface Props {
  userName?: string;
  birthday?: string | null;
}

export default function WelcomeBanner({ userName, birthday }: Props) {
  const { greeting, isDaytime, todayHoliday, summerPeak, isBirthday } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const todays = getTodayHolidays(now);
    const priority = { CN: 0, INTL: 1, IN: 2, EU: 3, CN_TRAD: 4 };
    todays.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
    return {
      greeting: getTimeGreeting(hour),
      isDaytime: hour >= 6 && hour < 19,
      todayHoliday: todays[0] ?? null,
      summerPeak: isEUSummerPeak(now),
      isBirthday: isSameMonthDay(birthday, now),
    };
  }, [birthday]);

  // 生日优先级最高 —— 今天是你生日，其他提示都让位
  const showBirthday = isBirthday;
  const showHoliday = !showBirthday && !!todayHoliday;
  const showSummer = !showBirthday && !showHoliday && summerPeak;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isDaytime ? (
            <HiOutlineSun className="w-6 h-6 text-amber-500 flex-shrink-0" />
          ) : (
            <HiOutlineMoon className="w-6 h-6 text-indigo-500 flex-shrink-0" />
          )}
          <h1 className="text-2xl font-bold text-gray-800">
            {greeting}，{userName || '同事'}
          </h1>
        </div>

        {showBirthday && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-100 to-amber-100 border border-rose-200 px-3 py-1.5">
            <HiOutlineGift className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="text-sm text-rose-700">
              今天是你的生日，<span className="font-semibold">生日快乐！</span>
            </span>
          </div>
        )}

        {showHoliday && todayHoliday && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 px-3 py-1.5">
            <HiOutlineSparkles className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span className="text-sm text-rose-700">
              今天是 <span className="font-semibold">{todayHoliday.name}</span>
              {todayHoliday.note && <span className="text-rose-400 ml-1">· {todayHoliday.note}</span>}
            </span>
          </div>
        )}

        {showSummer && (
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-3 py-1.5">
            <HiOutlineInformationCircle className="w-4 h-4 text-sky-500 flex-shrink-0" />
            <span className="text-sm text-sky-700">
              欧洲客户正处休假高峰，邮件响应可能延迟，请耐心跟进
            </span>
          </div>
        )}

        {!showBirthday && !showHoliday && !showSummer && (
          <p className="mt-2 text-[13px] text-gray-500">
            欢迎回来，愿今天一切顺利
          </p>
        )}
      </div>

      <WeatherCard />
    </div>
  );
}
