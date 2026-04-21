'use client';

import React from 'react';
import Link from 'next/link';
import type { WidgetProps } from '../types';

export function TeamFollowUpsWidget({ data }: WidgetProps) {
  const { teamFollowUps } = data;
  if (!teamFollowUps) {
    return <p className="py-6 text-center text-sm text-gray-400">暂无数据</p>;
  }
  return (
    <>
      <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
        <span>
          待跟进 <span className="font-semibold text-gray-800">{teamFollowUps.teamPending}</span>
          <span className="mx-1.5 text-gray-300">/</span>
          逾期 <span className="font-semibold text-red-600">{teamFollowUps.teamOverdue}</span>
        </span>
      </div>
      {teamFollowUps.byOwner.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">暂无数据</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full min-w-[20rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="py-2 px-1 text-left font-medium">姓名</th>
                <th className="py-2 px-1 text-right font-medium">待跟进</th>
                <th className="py-2 px-1 text-right font-medium">逾期</th>
                <th className="py-2 px-1 text-right font-medium">本周已完成</th>
              </tr>
            </thead>
            <tbody>
              {teamFollowUps.byOwner.slice(0, 10).map((r) => (
                <tr key={r.userId} className={`border-b border-gray-100 ${r.overdue > 0 ? 'bg-red-50/40' : ''}`}>
                  <td className="py-2 px-1">
                    <Link href={`/follow-ups?ownerId=${r.userId}`} className="text-gray-800 hover:text-blue-600 hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 px-1 text-right text-gray-700">{r.pending}</td>
                  <td className={`py-2 px-1 text-right font-medium ${r.overdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{r.overdue}</td>
                  <td className="py-2 px-1 text-right text-gray-600">{r.completedThisWeek}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
