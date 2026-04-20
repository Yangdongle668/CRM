'use client';

import React from 'react';
import Link from 'next/link';
import {
  HiOutlineUsers,
  HiOutlineFunnel,
  HiOutlineClipboardDocumentList,
  HiOutlineCurrencyDollar,
  HiOutlineClock,
  HiOutlineArrowTrendingUp,
} from 'react-icons/hi2';
import type { WidgetProps } from '../types';

function MiniStat({
  icon: Icon,
  title,
  value,
  href,
  color,
}: {
  icon: React.ElementType;
  title: string;
  value: string | number;
  href: string;
  color: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 hover:bg-gray-100/80 transition-colors">
      <div className={`rounded-lg p-2 ${color}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-gray-500">{title}</p>
        <p className="text-lg font-bold text-gray-900">{value}</p>
      </div>
    </Link>
  );
}

export function StatsWidget({ data }: WidgetProps) {
  const { stats } = data;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 h-full content-start">
      <MiniStat icon={HiOutlineUsers} title="客户总数" value={stats?.totalCustomers ?? 0} href="/customers" color="bg-blue-500" />
      <MiniStat icon={HiOutlineFunnel} title="销售线索" value={stats?.totalLeads ?? 0} href="/leads" color="bg-violet-500" />
      <MiniStat icon={HiOutlineClipboardDocumentList} title="订单总数" value={stats?.totalOrders ?? 0} href="/orders" color="bg-emerald-500" />
      <MiniStat icon={HiOutlineCurrencyDollar} title="总收入" value={`$${(stats?.totalRevenue ?? 0).toLocaleString()}`} href="/orders" color="bg-amber-500" />
      <MiniStat icon={HiOutlineClock} title="待处理任务" value={stats?.pendingTasks ?? 0} href="/tasks" color="bg-orange-500" />
      <MiniStat icon={HiOutlineArrowTrendingUp} title="本月新线索" value={stats?.newLeadsThisMonth ?? 0} href="/leads" color="bg-pink-500" />
    </div>
  );
}
