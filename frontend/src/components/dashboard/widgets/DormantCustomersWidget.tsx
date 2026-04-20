'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { HiOutlineFaceSmile, HiOutlineEnvelope } from 'react-icons/hi2';
import { customersApi } from '@/lib/api';
import type { WidgetProps } from '../types';

interface DormantItem {
  id: string;
  companyName: string;
  country?: string | null;
  lastContactAt: string;
  daysSince: number;
  owner?: { id: string; name: string } | null;
}

export function DormantCustomersWidget(_props: WidgetProps) {
  const [items, setItems] = useState<DormantItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customersApi
      .dormant({ days: 30, limit: 8 })
      .then((res: any) => {
        setItems(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="py-6 text-center text-sm text-gray-400">加载中...</p>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-gray-400">
        <HiOutlineFaceSmile className="w-10 h-10 mb-2 text-emerald-400" />
        <p className="text-sm text-emerald-600 font-medium">每位客户都保持联系，做得很好！</p>
        <p className="text-[11px] mt-1 text-gray-400">30 天内都有跟进记录</p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-2 text-[11px] text-gray-500">
        好久没联系了，要不要打个招呼？
      </p>
      <ul className="space-y-2">
        {items.map((c) => {
          const urgent = c.daysSince >= 60;
          return (
            <li
              key={c.id}
              className={`flex items-center gap-3 rounded-xl p-2.5 transition-colors ${
                urgent
                  ? 'bg-amber-50/60 border border-amber-100 hover:bg-amber-50'
                  : 'bg-gray-50/60 border border-gray-100 hover:bg-gray-100/60'
              }`}
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/customers/${c.id}`}
                  className="block text-sm font-medium text-gray-800 hover:text-primary-600 truncate"
                >
                  {c.companyName}
                </Link>
                <p className="text-[11px] text-gray-500 truncate">
                  {c.country || '—'}
                  {c.owner && ` · ${c.owner.name}`}
                </p>
              </div>

              <div className="flex-shrink-0 flex items-center gap-2">
                <span
                  className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                    urgent ? 'bg-amber-200 text-amber-800' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {c.daysSince} 天未联系
                </span>
                <Link
                  href={`/emails?to=${encodeURIComponent(c.companyName)}`}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-colors"
                  title="给客户写邮件"
                >
                  <HiOutlineEnvelope className="w-4 h-4" />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
