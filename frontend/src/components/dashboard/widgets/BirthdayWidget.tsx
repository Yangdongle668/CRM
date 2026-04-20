'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { HiOutlineCake, HiOutlineGift } from 'react-icons/hi2';
import { usersApi } from '@/lib/api';
import type { User } from '@/types';
import type { WidgetProps } from '../types';

interface UpcomingBirthday {
  user: Pick<User, 'id' | 'name' | 'avatar' | 'role'>;
  daysUntil: number;
  monthDay: string;
  age?: number;
}

function computeUpcoming(users: User[], now: Date, daysAhead: number): UpcomingBirthday[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result: UpcomingBirthday[] = [];

  for (const u of users) {
    if (!u.birthday) continue;
    const d = new Date(u.birthday);
    if (isNaN(d.getTime())) continue;

    const origYear = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();

    // 今年的生日
    let next = new Date(today.getFullYear(), m, day);
    if (next.getTime() < today.getTime()) {
      // 今年已过，看明年
      next = new Date(today.getFullYear() + 1, m, day);
    }
    const diff = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (diff > daysAhead) continue;

    const mStr = String(m + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');

    result.push({
      user: u,
      daysUntil: diff,
      monthDay: `${mStr}-${dStr}`,
      age: origYear > 1900 ? next.getFullYear() - origYear : undefined,
    });
  }

  return result.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function BirthdayWidget(_props: WidgetProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi
      .list({ isActive: true })
      .then((res: any) => {
        const list = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
        setUsers(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const upcoming = useMemo(() => computeUpcoming(users, new Date(), 60).slice(0, 8), [users]);

  if (loading) {
    return <p className="py-6 text-center text-sm text-gray-400">加载中...</p>;
  }

  if (upcoming.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <HiOutlineCake className="w-10 h-10 mb-2 opacity-40" />
        <p className="text-sm">近期没有同事过生日</p>
        <p className="text-[11px] mt-1 text-gray-400">在"设置 · 个人资料"填入生日即可启用</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {upcoming.map(({ user, daysUntil, monthDay, age }) => {
        const today = daysUntil === 0;
        return (
          <li
            key={user.id}
            className={`flex items-center gap-3 rounded-xl p-3 transition-colors ${
              today
                ? 'bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100'
                : 'bg-gray-50/60 border border-gray-100 hover:bg-gray-100/60'
            }`}
          >
            <div
              className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${
                today ? 'bg-rose-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}
            >
              {today ? <HiOutlineGift className="w-5 h-5" /> : <HiOutlineCake className="w-4 h-4" />}
            </div>

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium truncate ${today ? 'text-rose-700' : 'text-gray-800'}`}>
                {user.name}
              </p>
              <p className="text-[11px] text-gray-500">
                {monthDay}
                {age !== undefined && ` · 将满 ${age} 岁`}
              </p>
            </div>

            <div className="flex-shrink-0">
              <span
                className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                  today
                    ? 'bg-rose-500 text-white'
                    : daysUntil <= 7
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {today ? '生日快乐！' : daysUntil === 1 ? '明天' : `${daysUntil} 天后`}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
