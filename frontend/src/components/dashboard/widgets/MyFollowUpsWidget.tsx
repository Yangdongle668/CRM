'use client';

import React from 'react';
import Link from 'next/link';
import { LEAD_STAGE_MAP } from '@/lib/constants';
import type { WidgetProps } from '../types';

export function MyFollowUpsWidget({ data }: WidgetProps) {
  const { myFollowUps } = data;
  return (
    <>
      {myFollowUps.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">暂无待跟进</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {myFollowUps.map((fu) => {
            const due = new Date(fu.dueAt);
            const overdue = due.getTime() < Date.now();
            const stageLabel = fu.lead?.stage
              ? LEAD_STAGE_MAP[fu.lead.stage]?.label || fu.lead.stage
              : '';
            return (
              <li key={fu.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {fu.lead?.companyName || fu.lead?.title || '(无关联线索)'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {stageLabel ? `${stageLabel} · ` : ''}
                    {due.toLocaleDateString('zh-CN')}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                  {overdue
                    ? `逾期 ${Math.ceil((Date.now() - due.getTime()) / 86400000)} 天`
                    : `${Math.max(1, Math.ceil((due.getTime() - Date.now()) / 86400000))} 天后`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-2 text-right">
        <Link href="/follow-ups" className="text-xs text-primary-500 hover:text-primary-600">
          查看全部
        </Link>
      </div>
    </>
  );
}
