'use client';

import React from 'react';
import Link from 'next/link';
import type { WidgetProps } from '../types';

const PRIORITY_COLOR: Record<string, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-blue-500',
  HIGH: 'text-orange-500',
  URGENT: 'text-red-500',
};
const PRIORITY_LABEL: Record<string, string> = {
  LOW: '低', MEDIUM: '中', HIGH: '高', URGENT: '紧急',
};

export function TasksWidget({ data }: WidgetProps) {
  const { recentTasks } = data;
  return (
    <>
      <ul className="divide-y divide-gray-100">
        {recentTasks.map((task) => (
          <li key={task.id} className="py-2.5 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
              {task.dueDate && (
                <p className="text-xs text-gray-400 mt-0.5">
                  截止：{new Date(task.dueDate).toLocaleDateString('zh-CN')}
                </p>
              )}
            </div>
            <span className={`ml-3 text-xs font-medium ${PRIORITY_COLOR[task.priority] || 'text-gray-500'}`}>
              {PRIORITY_LABEL[task.priority] || task.priority}
            </span>
          </li>
        ))}
        {recentTasks.length === 0 && (
          <li className="py-6 text-center text-gray-400 text-sm">暂无待处理任务</li>
        )}
      </ul>
      <div className="mt-2 text-right">
        <Link href="/tasks" className="text-xs text-primary-500 hover:text-primary-600">查看全部</Link>
      </div>
    </>
  );
}
