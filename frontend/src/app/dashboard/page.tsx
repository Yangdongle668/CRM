'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import AppLayout from '@/components/layout/AppLayout';
import WelcomeBanner from '@/components/dashboard/WelcomeBanner';
import { dashboardApi, tasksApi, memosApi, followUpsApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { DashboardData } from '@/components/dashboard/types';

const GridDashboard = dynamic(
  () => import('@/components/dashboard/GridDashboard'),
  { ssr: false, loading: () => <div className="h-64 flex items-center justify-center text-gray-400 text-sm">加载中...</div> },
);

const EMPTY: DashboardData = {
  stats: null,
  salesTrend: [],
  funnelData: [],
  rankings: [],
  recentTasks: [],
  todayMemos: [],
  myFollowUps: [],
  teamFollowUps: null,
};

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const [statsRes, trendRes, funnelRes, tasksRes, memosRes] = await Promise.all([
          dashboardApi.getStats(),
          dashboardApi.getSalesTrend(),
          dashboardApi.getFunnel(),
          tasksApi.list({ pageSize: 5, status: 'PENDING' }),
          memosApi.list({ date: today }),
        ]);

        const stats = (statsRes as any).data ?? null;
        const salesTrend = (trendRes as any).data;
        const funnelData = (funnelRes as any).data;
        const tasksData = (tasksRes as any).data;
        const memosData = (memosRes as any).data;

        const next: Partial<DashboardData> = {
          stats,
          salesTrend: Array.isArray(salesTrend) ? salesTrend : [],
          funnelData: Array.isArray(funnelData) ? funnelData : [],
          recentTasks: Array.isArray(tasksData?.items) ? tasksData.items : Array.isArray(tasksData) ? tasksData : [],
          todayMemos: Array.isArray(memosData) ? memosData : [],
        };

        if (isAdmin) {
          try {
            const rankingsRes = await dashboardApi.getRankings();
            next.rankings = (rankingsRes as any).data ?? [];
          } catch { next.rankings = []; }
        } else {
          next.rankings = [];
        }

        try {
          const fuRes: any = await followUpsApi.list({ status: 'PENDING' });
          next.myFollowUps = (fuRes.data?.items ?? []).slice(0, 5);
        } catch { next.myFollowUps = []; }

        if (isAdmin) {
          try {
            const ovRes: any = await followUpsApi.adminOverview();
            next.teamFollowUps = ovRes.data ?? null;
          } catch { next.teamFollowUps = null; }
        } else {
          next.teamFollowUps = null;
        }

        setData({ ...EMPTY, ...next });
      } catch {
        // errors handled by api interceptor
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAdmin]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <WelcomeBanner
          userName={user?.name}
          birthday={user?.birthday}
          editMode={editMode}
          onEnterEdit={() => setEditMode(true)}
        />

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400 text-sm">加载中...</div>
          </div>
        ) : (
          <GridDashboard
            data={data}
            editMode={editMode}
            onExitEdit={() => setEditMode(false)}
          />
        )}
      </div>
    </AppLayout>
  );
}
