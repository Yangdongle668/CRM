'use client';

import React, { useMemo } from 'react';
import {
  HiOutlineSun,
  HiOutlineMoon,
  HiOutlineSparkles,
  HiOutlineInformationCircle,
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

interface Props {
  userName?: string;
}

export default function WelcomeBanner({ userName }: Props) {
  const { greeting, isDaytime, todayHoliday, summerPeak } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const todays = getTodayHolidays(now);
    // 优先显示法定节日，其次传统节日，最后其他
    const priority = { CN: 0, INTL: 1, IN: 2, EU: 3, CN_TRAD: 4 };
    todays.sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9));
    return {
      greeting: getTimeGreeting(hour),
      isDaytime: hour >= 6 && hour < 19,
      todayHoliday: todays[0] ?? null,
      summerPeak: isEUSummerPeak(now),
    };
  }, []);

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

        {todayHoliday ? (
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 px-3 py-1.5">
            <HiOutlineSparkles className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span className="text-sm text-rose-700">
              今天是 <span className="font-semibold">{todayHoliday.name}</span>
              {todayHoliday.note && <span className="text-rose-400 ml-1">· {todayHoliday.note}</span>}
            </span>
          </div>
        ) : summerPeak ? (
          <div className="mt-2 inline-flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-3 py-1.5">
            <HiOutlineInformationCircle className="w-4 h-4 text-sky-500 flex-shrink-0" />
            <span className="text-sm text-sky-700">
              欧洲客户正处休假高峰，邮件响应可能延迟，请耐心跟进
            </span>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-gray-500">
            欢迎回来，愿今天一切顺利
          </p>
        )}
      </div>

      <WeatherCard />
    </div>
  );
}
