import { StatsWidget } from './widgets/StatsWidget';
import { SalesTrendWidget } from './widgets/SalesTrendWidget';
import { FunnelWidget } from './widgets/FunnelWidget';
import { MemosWidget } from './widgets/MemosWidget';
import { MyFollowUpsWidget } from './widgets/MyFollowUpsWidget';
import { TeamFollowUpsWidget } from './widgets/TeamFollowUpsWidget';
import { RankingsWidget } from './widgets/RankingsWidget';
import { TasksWidget } from './widgets/TasksWidget';
import { HolidayCountdownWidget } from './widgets/HolidayCountdownWidget';
import { BirthdayWidget } from './widgets/BirthdayWidget';
import { DormantCustomersWidget } from './widgets/DormantCustomersWidget';
import { WorldClockWidget } from './widgets/WorldClockWidget';
import type { GridItem, SavedLayout, WidgetDef } from './types';

export const WIDGET_REGISTRY: WidgetDef[] = [
  {
    id: 'stats',
    title: '关键指标',
    component: StatsWidget,
    defaultW: 12,
    defaultH: 3,
    minW: 4,
    minH: 2,
  },
  {
    id: 'trend',
    title: '销售趋势',
    component: SalesTrendWidget,
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 3,
    financeHidden: true,
  },
  {
    id: 'funnel',
    title: '销售漏斗',
    component: FunnelWidget,
    defaultW: 6,
    defaultH: 5,
    minW: 4,
    minH: 3,
    financeHidden: true,
  },
  {
    id: 'memos',
    title: '今日备忘',
    component: MemosWidget,
    defaultW: 12,
    defaultH: 3,
    minW: 4,
    minH: 2,
  },
  {
    id: 'my-followups',
    title: '我的跟进',
    component: MyFollowUpsWidget,
    defaultW: 6,
    defaultH: 4,
    minW: 3,
    minH: 3,
    financeHidden: true,
  },
  {
    id: 'team-followups',
    title: '团队跟进进度',
    component: TeamFollowUpsWidget,
    defaultW: 6,
    defaultH: 4,
    minW: 3,
    minH: 3,
    adminOnly: true,
  },
  {
    id: 'rankings',
    title: '销售排名',
    component: RankingsWidget,
    defaultW: 6,
    defaultH: 5,
    minW: 3,
    minH: 3,
    adminOnly: true,
  },
  {
    id: 'tasks',
    title: '待处理任务',
    component: TasksWidget,
    defaultW: 6,
    defaultH: 4,
    minW: 3,
    minH: 3,
  },
  {
    id: 'holiday-countdown',
    title: '节日提醒',
    component: HolidayCountdownWidget,
    defaultW: 6,
    defaultH: 5,
    minW: 3,
    minH: 3,
  },
  {
    id: 'birthdays',
    title: '生日提醒',
    component: BirthdayWidget,
    defaultW: 6,
    defaultH: 4,
    minW: 3,
    minH: 3,
  },
  {
    id: 'dormant-customers',
    title: '好久没联系',
    component: DormantCustomersWidget,
    defaultW: 6,
    defaultH: 4,
    minW: 3,
    minH: 3,
    financeHidden: true,
  },
  {
    id: 'world-clock',
    title: '世界时间',
    component: WorldClockWidget,
    defaultW: 6,
    defaultH: 4,
    minW: 3,
    minH: 3,
  },
];

/** Build default layout positions for a given set of widget IDs (top-to-bottom, auto-packing). */
function buildLayout(ids: string[]): SavedLayout {
  const layout: GridItem[] = [];
  let curY = 0;
  let rowH = 0;
  let curX = 0;

  for (const id of ids) {
    const def = WIDGET_REGISTRY.find((d) => d.id === id);
    if (!def) continue;
    const w = def.defaultW;
    const h = def.defaultH;

    if (curX + w > 12) {
      curY += rowH;
      curX = 0;
      rowH = 0;
    }

    layout.push({ i: id, x: curX, y: curY, w, h });
    curX += w;
    rowH = Math.max(rowH, h);
  }

  return layout;
}

export const DEFAULT_LAYOUT_ADMIN: SavedLayout = buildLayout([
  'stats',
  'trend',
  'funnel',
  'memos',
  'my-followups',
  'team-followups',
  'holiday-countdown',
  'birthdays',
  'world-clock',
  'dormant-customers',
  'tasks',
  'rankings',
]);

export const DEFAULT_LAYOUT_SALESPERSON: SavedLayout = buildLayout([
  'stats',
  'trend',
  'funnel',
  'memos',
  'my-followups',
  'dormant-customers',
  'holiday-countdown',
  'birthdays',
  'world-clock',
  'tasks',
]);

export const DEFAULT_LAYOUT_FINANCE: SavedLayout = buildLayout([
  'stats',
  'holiday-countdown',
  'birthdays',
  'world-clock',
  'tasks',
]);

export function getDefaultLayout(role: string, isAdmin: boolean): SavedLayout {
  if (isAdmin) return DEFAULT_LAYOUT_ADMIN;
  if (role === 'FINANCE') return DEFAULT_LAYOUT_FINANCE;
  return DEFAULT_LAYOUT_SALESPERSON;
}

/** Filter visible widget IDs for the given user */
export function getVisibleWidgets(isAdmin: boolean, userRole: string): WidgetDef[] {
  return WIDGET_REGISTRY.filter((w) => {
    if (w.adminOnly && !isAdmin) return false;
    if (w.financeHidden && userRole === 'FINANCE') return false;
    return true;
  });
}
