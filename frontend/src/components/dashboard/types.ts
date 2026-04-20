import type React from 'react';
import type {
  DashboardStats,
  SalesTrend,
  FunnelData,
  SalesRanking,
  Task,
  Memo,
  FollowUp,
  FollowUpAdminOverview,
} from '@/types';

export interface DashboardData {
  stats: DashboardStats | null;
  salesTrend: SalesTrend[];
  funnelData: FunnelData[];
  rankings: SalesRanking[];
  recentTasks: Task[];
  todayMemos: Memo[];
  myFollowUps: FollowUp[];
  teamFollowUps: FollowUpAdminOverview | null;
}

export interface WidgetProps {
  data: DashboardData;
  isAdmin: boolean;
  userRole: string;
}

export interface WidgetDef {
  id: string;
  title: string;
  component: React.ComponentType<WidgetProps>;
  /** Default grid size when first placed */
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  adminOnly?: boolean;
  /** Hidden for the FINANCE role */
  financeHidden?: boolean;
}

export interface GridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SavedLayout = GridItem[];
