'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import AppLayout from '@/components/layout/AppLayout';
import { dashboardApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import toast from 'react-hot-toast';
import {
  HiOutlineUsers,
  HiOutlineFunnel,
  HiOutlineShoppingCart,
  HiOutlineCurrencyDollar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineCheckCircle,
  HiOutlineEnvelope,
  HiOutlineArrowTrendingUp,
} from 'react-icons/hi2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

type Period = 'today' | 'week' | 'month' | 'year';

interface OverviewData {
  period: string;
  from: string;
  to: string;
  newCustomers: number;
  newLeads: number;
  newOrders: number;
  newRevenue: number;
  newActivities: number;
  completedTasks: number;
  sentEmails: number;
}

interface SalespersonStat {
  userId: string;
  name: string;
  email: string;
  newCustomers: number;
  newLeads: number;
  newOrders: number;
  revenue: number;
  activities: number;
  sentEmails: number;
  totalCustomers: number;
  pendingTasks: number;
}

interface FollowUpRow {
  userId: string;
  name: string;
  email: string;
  weeklyActivities: number;
  activeLeads: number;
  dueFollowUps: number;
  overdueFollowUps: number;
  stagnantLeads: number;
  weeklyEmails: number;
}

interface TrendPoint {
  key: string;
  leads: number;
  customers: number;
  orders: number;
  revenue: number;
}

const PERIOD_OPTIONS: Array<{ key: Period; label: string }> = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'year', label: '本年' },
];

export default function AdminPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [period, setPeriod] = useState<Period>('month');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [salespersonStats, setSalespersonStats] = useState<SalespersonStat[]>([]);
  const [followUpData, setFollowUpData] = useState<FollowUpRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'month'>('day');
  const [loading, setLoading] = useState(false);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error('无权访问管理中心');
      router.replace('/dashboard');
    }
  }, [authLoading, isAdmin, router]);

  const fetchAll = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [overviewRes, statsRes, followUpRes, trendRes]: any[] = await Promise.all([
        dashboardApi.getAdminOverview(period),
        dashboardApi.getSalespersonStats(period),
        dashboardApi.getFollowUpProgress(),
        dashboardApi.getAdminTrend(trendGranularity, trendGranularity === 'day' ? 30 : 12),
      ]);
      setOverview(overviewRes.data);
      setSalespersonStats(statsRes.data || []);
      setFollowUpData(followUpRes.data || []);
      setTrend(trendRes.data || []);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [isAdmin, period, trendGranularity]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const formatCurrency = (n: number) =>
    `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const trendChartData = {
    labels: trend.map((p) => p.key),
    datasets: [
      {
        label: '新增线索',
        data: trend.map((p) => p.leads),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        fill: true,
        tension: 0.35,
        yAxisID: 'y',
      },
      {
        label: '新增客户',
        data: trend.map((p) => p.customers),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: false,
        tension: 0.35,
        yAxisID: 'y',
      },
      {
        label: '销售额',
        data: trend.map((p) => p.revenue),
        borderColor: 'rgb(245, 158, 11)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: false,
        tension: 0.35,
        yAxisID: 'y1',
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const },
    },
    scales: {
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        title: { display: true, text: '数量' },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        title: { display: true, text: '金额 ($)' },
      },
    },
  };

  if (authLoading || !isAdmin) {
    return (
      <AppLayout>
        <div className="py-20 text-center text-gray-500">加载中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">管理中心</h1>
            <p className="mt-1 text-sm text-gray-500">
              全局统计数据、业务员工作量与跟进进度监控
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-gray-100 p-0.5">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPeriod(opt.key)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  period === opt.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7">
          <OverviewCard
            title="新增客户"
            value={overview?.newCustomers ?? 0}
            icon={HiOutlineUsers}
            color="blue"
          />
          <OverviewCard
            title="新增线索"
            value={overview?.newLeads ?? 0}
            icon={HiOutlineFunnel}
            color="indigo"
          />
          <OverviewCard
            title="新增订单"
            value={overview?.newOrders ?? 0}
            icon={HiOutlineShoppingCart}
            color="emerald"
          />
          <OverviewCard
            title="销售额"
            value={formatCurrency(overview?.newRevenue ?? 0)}
            icon={HiOutlineCurrencyDollar}
            color="amber"
          />
          <OverviewCard
            title="活动记录"
            value={overview?.newActivities ?? 0}
            icon={HiOutlineChatBubbleLeftRight}
            color="purple"
          />
          <OverviewCard
            title="完成任务"
            value={overview?.completedTasks ?? 0}
            icon={HiOutlineCheckCircle}
            color="teal"
          />
          <OverviewCard
            title="已发邮件"
            value={overview?.sentEmails ?? 0}
            icon={HiOutlineEnvelope}
            color="pink"
          />
        </div>

        {/* Trend Chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HiOutlineArrowTrendingUp className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-semibold text-gray-900">业务趋势</h2>
            </div>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-xs">
              <button
                onClick={() => setTrendGranularity('day')}
                className={`rounded-md px-3 py-1 transition-colors ${
                  trendGranularity === 'day'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                近30天
              </button>
              <button
                onClick={() => setTrendGranularity('month')}
                className={`rounded-md px-3 py-1 transition-colors ${
                  trendGranularity === 'month'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                近12月
              </button>
            </div>
          </div>
          <div style={{ height: 300 }}>
            {trend.length > 0 ? (
              <Line data={trendChartData} options={trendChartOptions} />
            ) : (
              <div className="flex h-full items-center justify-center text-gray-400">
                {loading ? '加载中...' : '暂无数据'}
              </div>
            )}
          </div>
        </div>

        {/* Salesperson Stats Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              业务员业绩（{PERIOD_OPTIONS.find((p) => p.key === period)?.label}）
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">按销售额降序排列</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">业务员</th>
                  <th className="px-4 py-3 text-right">新增客户</th>
                  <th className="px-4 py-3 text-right">新增线索</th>
                  <th className="px-4 py-3 text-right">订单数</th>
                  <th className="px-4 py-3 text-right">销售额</th>
                  <th className="px-4 py-3 text-right">活动</th>
                  <th className="px-4 py-3 text-right">已发邮件</th>
                  <th className="px-4 py-3 text-right">客户总数</th>
                  <th className="px-4 py-3 text-right">待处理任务</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {salespersonStats.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-gray-400"
                    >
                      {loading ? '加载中...' : '暂无数据'}
                    </td>
                  </tr>
                )}
                {salespersonStats.map((s, idx) => (
                  <tr key={s.userId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white ${
                            idx === 0
                              ? 'bg-yellow-500'
                              : idx === 1
                              ? 'bg-gray-400'
                              : idx === 2
                              ? 'bg-orange-400'
                              : 'bg-gradient-to-br from-blue-400 to-blue-600'
                          }`}
                        >
                          {s.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{s.name}</div>
                          <div className="text-xs text-gray-500">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{s.newCustomers}</td>
                    <td className="px-4 py-3 text-right">{s.newLeads}</td>
                    <td className="px-4 py-3 text-right">{s.newOrders}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                      {formatCurrency(s.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right">{s.activities}</td>
                    <td className="px-4 py-3 text-right">{s.sentEmails}</td>
                    <td className="px-4 py-3 text-right">{s.totalCustomers}</td>
                    <td className="px-4 py-3 text-right">
                      {s.pendingTasks > 0 ? (
                        <span className="inline-flex rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                          {s.pendingTasks}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Follow-up Progress Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold text-gray-900">本周跟进进度</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              监控业务员本周活动量、逾期跟进和沉默客户
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">业务员</th>
                  <th className="px-4 py-3 text-right">本周活动</th>
                  <th className="px-4 py-3 text-right">本周邮件</th>
                  <th className="px-4 py-3 text-right">活跃线索</th>
                  <th className="px-4 py-3 text-right">即将跟进</th>
                  <th className="px-4 py-3 text-right">逾期跟进</th>
                  <th className="px-4 py-3 text-right">沉默线索</th>
                  <th className="px-4 py-3 text-right">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {followUpData.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-10 text-center text-gray-400"
                    >
                      {loading ? '加载中...' : '暂无数据'}
                    </td>
                  </tr>
                )}
                {followUpData.map((row) => {
                  const healthScore =
                    row.weeklyActivities * 2 +
                    row.weeklyEmails -
                    row.overdueFollowUps * 3 -
                    row.stagnantLeads;
                  const status =
                    row.overdueFollowUps > 5 || row.stagnantLeads > 10
                      ? { label: '需关注', color: 'bg-red-100 text-red-700' }
                      : healthScore >= 10
                      ? { label: '良好', color: 'bg-green-100 text-green-700' }
                      : healthScore >= 5
                      ? { label: '正常', color: 'bg-blue-100 text-blue-700' }
                      : { label: '偏低', color: 'bg-yellow-100 text-yellow-700' };
                  return (
                    <tr key={row.userId} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-indigo-600 text-xs font-semibold text-white">
                            {row.name?.charAt(0) || '?'}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              {row.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {row.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.weeklyActivities}
                      </td>
                      <td className="px-4 py-3 text-right">{row.weeklyEmails}</td>
                      <td className="px-4 py-3 text-right">{row.activeLeads}</td>
                      <td className="px-4 py-3 text-right">
                        {row.dueFollowUps > 0 ? (
                          <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {row.dueFollowUps}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.overdueFollowUps > 0 ? (
                          <span className="inline-flex rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            {row.overdueFollowUps}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.stagnantLeads > 0 ? (
                          <span className="inline-flex rounded-md bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                            {row.stagnantLeads}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-3 text-xs text-gray-500">
            说明：活跃线索 = 未关闭/未转化的线索；即将跟进 = 7天内需跟进；逾期跟进 =
            已过下次跟进时间；沉默线索 = 超过14天未联系
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ==================== Overview Card ====================
interface OverviewCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: 'blue' | 'indigo' | 'emerald' | 'amber' | 'purple' | 'teal' | 'pink';
}

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600',
  teal: 'bg-teal-50 text-teal-600',
  pink: 'bg-pink-50 text-pink-600',
};

function OverviewCard({ title, value, icon: Icon, color }: OverviewCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-gray-500">{title}</p>
          <p className="mt-1 truncate text-xl font-bold text-gray-900">
            {value}
          </p>
        </div>
        <div
          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${COLOR_MAP[color]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
