'use client';

import React, { useEffect, useState } from 'react';
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
import { Line, Bar } from 'react-chartjs-2';
import AppLayout from '@/components/layout/AppLayout';
import StatsCard from '@/components/ui/StatsCard';
import { dashboardApi, tasksApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { LEAD_STAGE_MAP } from '@/lib/constants';
import {
  DashboardStats,
  SalesTrend,
  FunnelData,
  SalesRanking,
  Task,
} from '@/types';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const TASK_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-blue-500',
  HIGH: 'text-orange-500',
  URGENT: 'text-red-500',
};

const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: '低',
  MEDIUM: '中',
  HIGH: '高',
  URGENT: '紧急',
};

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesTrend, setSalesTrend] = useState<SalesTrend[]>([]);
  const [funnelData, setFunnelData] = useState<FunnelData[]>([]);
  const [rankings, setRankings] = useState<SalesRanking[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, trendRes, funnelRes, tasksRes] = await Promise.all([
          dashboardApi.getStats(),
          dashboardApi.getSalesTrend(),
          dashboardApi.getFunnel(),
          tasksApi.list({ pageSize: 5, status: 'PENDING' }),
        ]);

        setStats((statsRes as any).data);
        const trendData = (trendRes as any).data;
        setSalesTrend(Array.isArray(trendData) ? trendData : []);
        const funnelResult = (funnelRes as any).data;
        setFunnelData(Array.isArray(funnelResult) ? funnelResult : []);
        const tasksData = (tasksRes as any).data;
        setRecentTasks(
          Array.isArray(tasksData?.items) ? tasksData.items : Array.isArray(tasksData) ? tasksData : []
        );

        if (isAdmin) {
          const rankingsRes = await dashboardApi.getRankings();
          const rankingsData = (rankingsRes as any).data;
          setRankings(Array.isArray(rankingsData) ? rankingsData : []);
        }
      } catch {
        // errors handled by api interceptor
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAdmin]);

  // --- Chart data ---
  const trendChartData = {
    labels: salesTrend.map((item) => item.month),
    datasets: [
      {
        label: '销售额',
        data: salesTrend.map((item) => item.amount),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.3,
      },
      {
        label: '订单数',
        data: salesTrend.map((item) => item.count),
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: false,
        tension: 0.3,
        yAxisID: 'y1',
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const },
      title: { display: false },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: { display: true, text: '销售额' },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        title: { display: true, text: '订单数' },
        grid: { drawOnChartArea: false },
      },
    },
  };

  const funnelChartData = {
    labels: funnelData.map(
      (item) => LEAD_STAGE_MAP[item.stage]?.label || item.label || item.stage
    ),
    datasets: [
      {
        label: '线索数量',
        data: funnelData.map((item) => item.count),
        backgroundColor: [
          'rgba(59, 130, 246, 0.7)',
          'rgba(99, 102, 241, 0.7)',
          'rgba(139, 92, 246, 0.7)',
          'rgba(234, 179, 8, 0.7)',
          'rgba(249, 115, 22, 0.7)',
          'rgba(34, 197, 94, 0.7)',
          'rgba(239, 68, 68, 0.7)',
        ],
        borderWidth: 0,
        borderRadius: 4,
      },
    ],
  };

  const funnelChartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      x: { title: { display: true, text: '数量' } },
    },
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-gray-500 text-lg">加载中...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
          <p className="text-gray-500 mt-1">
            欢迎回来，{user?.name || '用户'}
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatsCard
            title="客户总数"
            value={stats?.totalCustomers ?? 0}
            icon="users"
          />
          <StatsCard
            title="销售线索"
            value={stats?.totalLeads ?? 0}
            icon="target"
          />
          <StatsCard
            title="订单总数"
            value={stats?.totalOrders ?? 0}
            icon="shoppingCart"
          />
          <StatsCard
            title="总收入"
            value={`$${(stats?.totalRevenue ?? 0).toLocaleString()}`}
            icon="dollarSign"
          />
          <StatsCard
            title="待处理任务"
            value={stats?.pendingTasks ?? 0}
            icon="clock"
          />
          <StatsCard
            title="本月新线索"
            value={stats?.newLeadsThisMonth ?? 0}
            icon="trendingUp"
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales trend */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              销售趋势
            </h2>
            <Line data={trendChartData} options={trendChartOptions} />
          </div>

          {/* Sales funnel */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              销售漏斗
            </h2>
            <Bar data={funnelChartData} options={funnelChartOptions} />
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top salesperson rankings (admin only) */}
          {isAdmin && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                销售排名
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-2 font-medium text-gray-600">
                        排名
                      </th>
                      <th className="text-left py-3 px-2 font-medium text-gray-600">
                        姓名
                      </th>
                      <th className="text-right py-3 px-2 font-medium text-gray-600">
                        销售额
                      </th>
                      <th className="text-right py-3 px-2 font-medium text-gray-600">
                        订单数
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.map((person, index) => (
                      <tr
                        key={person.userId}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-3 px-2">
                          <span
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              index === 0
                                ? 'bg-yellow-100 text-yellow-700'
                                : index === 1
                                ? 'bg-gray-100 text-gray-700'
                                : index === 2
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-gray-50 text-gray-500'
                            }`}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-2 font-medium text-gray-800">
                          {person.name}
                        </td>
                        <td className="py-3 px-2 text-right text-gray-700">
                          ${person.revenue.toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-right text-gray-700">
                          {person.orderCount}
                        </td>
                      </tr>
                    ))}
                    {rankings.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="py-6 text-center text-gray-400"
                        >
                          暂无数据
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent tasks */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              待处理任务
            </h2>
            <ul className="divide-y divide-gray-100">
              {recentTasks.map((task) => (
                <li
                  key={task.id}
                  className="py-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {task.title}
                    </p>
                    {task.dueDate && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        截止：{new Date(task.dueDate).toLocaleDateString('zh-CN')}
                      </p>
                    )}
                  </div>
                  <span
                    className={`ml-3 text-xs font-medium ${
                      TASK_PRIORITY_COLORS[task.priority] || 'text-gray-500'
                    }`}
                  >
                    {TASK_PRIORITY_LABELS[task.priority] || task.priority}
                  </span>
                </li>
              ))}
              {recentTasks.length === 0 && (
                <li className="py-6 text-center text-gray-400 text-sm">
                  暂无待处理任务
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
