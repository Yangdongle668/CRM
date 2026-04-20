'use client';

import React from 'react';
import type { WidgetProps } from '../types';

export function RankingsWidget({ data }: WidgetProps) {
  const { rankings } = data;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-2 px-2 text-left font-medium text-gray-600">排名</th>
            <th className="py-2 px-2 text-left font-medium text-gray-600">姓名</th>
            <th className="py-2 px-2 text-right font-medium text-gray-600">销售额</th>
            <th className="py-2 px-2 text-right font-medium text-gray-600">订单数</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((p, i) => (
            <tr key={p.userId} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2.5 px-2">
                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                  i === 0 ? 'bg-yellow-100 text-yellow-700' :
                  i === 1 ? 'bg-gray-100 text-gray-700' :
                  i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'
                }`}>{i + 1}</span>
              </td>
              <td className="py-2.5 px-2 font-medium text-gray-800">{p.name}</td>
              <td className="py-2.5 px-2 text-right text-gray-700">${p.revenue.toLocaleString()}</td>
              <td className="py-2.5 px-2 text-right text-gray-700">{p.orderCount}</td>
            </tr>
          ))}
          {rankings.length === 0 && (
            <tr><td colSpan={4} className="py-6 text-center text-gray-400">暂无数据</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
