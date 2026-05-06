'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  WidthProvider,
  ResponsiveReactGridLayout,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  HiOutlinePencilSquare,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlinePlus,
  HiOutlineArrowPath,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { authApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { getDefaultLayout, getVisibleWidgets, WIDGET_REGISTRY } from './registry';
import type { DashboardData, GridItem, SavedLayout } from './types';

const ResponsiveGridLayout = WidthProvider(ResponsiveReactGridLayout);

const BREAKPOINTS = { lg: 1200, md: 768, sm: 480, xs: 0 };
const COLS = { lg: 12, md: 6, sm: 4, xs: 2 };

function toSmLayout(layout: SavedLayout): GridItem[] {
  return layout.map((item, idx) => ({
    i: item.i,
    x: 0,
    y: idx * 3,
    w: 4,
    h: item.h,
  }));
}

interface WidgetCardProps {
  title: string;
  editMode: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}

function WidgetCard({ title, editMode, onRemove, children }: WidgetCardProps) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border h-full flex flex-col overflow-hidden transition-all ${
        editMode
          ? 'border-primary-300 shadow-primary-100 shadow-md'
          : 'border-gray-200/60'
      }`}
    >
      <div
        className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0 ${
          editMode
            ? 'drag-handle cursor-grab active:cursor-grabbing bg-primary-50/50'
            : ''
        }`}
      >
        {editMode && (
          <svg
            className="w-4 h-4 text-primary-400 mr-2 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M7 2a1 1 0 011 1v1h4V3a1 1 0 112 0v1h1a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2h1V3a1 1 0 011-1zm-2 6v8h10V8H5z" />
          </svg>
        )}
        <span className="text-[13px] font-semibold text-gray-800 flex-1 truncate select-none">
          {title}
        </span>
        {editMode && (
          <button
            onClick={onRemove}
            className="flex-shrink-0 ml-2 rounded-lg p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="移除此组件"
          >
            <HiOutlineXMark className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  );
}

interface AddWidgetPanelProps {
  availableIds: string[];
  onAdd: (id: string) => void;
  onClose: () => void;
}

function AddWidgetPanel({ availableIds, onAdd, onClose }: AddWidgetPanelProps) {
  if (availableIds.length === 0) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] font-semibold text-gray-700">添加组件</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <HiOutlineXMark className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {availableIds.map((id) => {
          const def = WIDGET_REGISTRY.find((w) => w.id === id);
          if (!def) return null;
          return (
            <button
              key={id}
              onClick={() => onAdd(id)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-primary-50 hover:border-primary-300 hover:text-primary-700 transition-colors"
            >
              <HiOutlinePlus className="w-3.5 h-3.5" />
              {def.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  data: DashboardData;
  editMode: boolean;
  onExitEdit: () => void;
}

export default function GridDashboard({ data, editMode, onExitEdit }: Props) {
  const { user, isAdmin, refreshUser } = useAuth();
  const userRole = user?.role ?? 'SALESPERSON';

  const visibleWidgets = getVisibleWidgets(isAdmin, userRole);
  const visibleIds = new Set(visibleWidgets.map((w) => w.id));

  const [layout, setLayout] = useState<SavedLayout>(() => {
    const saved = (user as any)?.preferences?.dashboardLayout as SavedLayout | undefined;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      return saved.filter((item) => visibleIds.has(item.i));
    }
    return getDefaultLayout(userRole, isAdmin);
  });

  // 把云端布局**同步进来**：useState 初始化只跑一次，登录响应里若没带
  // preferences（早期版本），第一次渲染时 user.preferences 还没到，组件
  // 就以"默认布局"启动；等 /auth/profile 把 preferences 拉回来时 user
  // 引用变了，这个 effect 才把云端布局喂进 layout state。
  // 用 hasHydratedFromServer ref 限定只跑一次，避免后续我们自己保存到
  // 云端的更新被 effect 反向覆盖（authApi.updatePreferences 会刷新 user）。
  const hasHydratedFromServer = useRef(false);
  useEffect(() => {
    if (hasHydratedFromServer.current) return;
    const saved = (user as any)?.preferences?.dashboardLayout as
      | SavedLayout
      | undefined;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      setLayout(saved.filter((item) => visibleIds.has(item.i)));
      hasHydratedFromServer.current = true;
    }
    // user 一旦不为 null（登录或 getProfile 完成）就尝试一次。
    // 后续 user 引用变化（保存偏好后刷新）已被 ref 锁掉。
    if (user) hasHydratedFromServer.current = true;
    // visibleIds 是基于 role 计算的稳定集合，effect 依赖 user 即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [showAddPanel, setShowAddPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback(
    (newLayout: SavedLayout) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSaving(true);
        try {
          await authApi.updatePreferences({ dashboardLayout: newLayout });
          // 保存成功后从服务器拉一次最新 user，让 auth-context 里的
          // user.preferences 与 DB 同步——否则换页 / 重渲染时仍看到老数据。
          if (typeof refreshUser === 'function') {
            try {
              await refreshUser();
            } catch {
              /* refreshUser 失败不阻断 */
            }
          }
        } catch (err: any) {
          // 之前 silent 吞掉，导致用户看不到任何反馈。这里显式 toast
          // + console.error，方便定位是网络 / 鉴权 / DTO 验证哪一层挂了。
          // eslint-disable-next-line no-console
          console.error('[Dashboard] save failed', err);
          const msg =
            err?.response?.data?.message ||
            err?.message ||
            '保存仪表盘布局失败';
          toast.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
        } finally {
          setSaving(false);
        }
      }, 1500);
    },
    [refreshUser],
  );

  const handleLayoutChange = useCallback(
    (_current: Layout, allLayouts: ResponsiveLayouts) => {
      const lg = allLayouts.lg;
      if (!lg) return;
      const next: SavedLayout = lg.map((item) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      }));
      setLayout(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const removeWidget = useCallback(
    (id: string) => {
      setLayout((prev) => {
        const next = prev.filter((item) => item.i !== id);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const addWidget = useCallback(
    (id: string) => {
      const def = WIDGET_REGISTRY.find((w) => w.id === id);
      if (!def) return;
      setLayout((prev) => {
        const maxY = prev.reduce((m, item) => Math.max(m, item.y + item.h), 0);
        const next = [
          ...prev,
          { i: id, x: 0, y: maxY, w: def.defaultW, h: def.defaultH },
        ];
        scheduleSave(next);
        return next;
      });
      setShowAddPanel(false);
    },
    [scheduleSave],
  );

  const resetLayout = useCallback(() => {
    const def = getDefaultLayout(userRole, isAdmin);
    setLayout(def);
    scheduleSave(def);
  }, [userRole, isAdmin, scheduleSave]);

  const activeIds = new Set(layout.map((item) => item.i));
  const addableIds = visibleWidgets
    .map((w) => w.id)
    .filter((id) => !activeIds.has(id));

  // Build layout objects with min sizes and edit-mode flags
  const lgLayout: LayoutItem[] = layout.map((item) => {
    const def = WIDGET_REGISTRY.find((w) => w.id === item.i);
    return {
      ...item,
      minW: def?.minW ?? 2,
      minH: def?.minH ?? 2,
      isDraggable: editMode,
      isResizable: editMode,
    };
  });

  const smLayout = toSmLayout(layout) as LayoutItem[];
  const layouts: ResponsiveLayouts = { lg: lgLayout, md: lgLayout, sm: smLayout, xs: smLayout };

  return (
    <div>
      {/* 编辑态才出现的悬浮工具条 —— 非编辑态 0 额外高度 */}
      {editMode && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/40 px-3 py-2 shadow-sm animate-scale-in">
          <span className="text-[12px] font-medium text-primary-700 flex items-center gap-1.5">
            <HiOutlinePencilSquare className="w-4 h-4" />
            自定义布局中 —— 拖动标题栏移动，右下角改大小
          </span>
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                <HiOutlineArrowPath className="w-3 h-3 animate-spin" />
                保存中
              </span>
            )}
            {addableIds.length > 0 && (
              <button
                onClick={() => setShowAddPanel((p) => !p)}
                className="flex items-center gap-1.5 rounded-xl border border-dashed border-primary-400 bg-white/60 px-3 py-1.5 text-[12px] font-medium text-primary-600 hover:bg-white transition-colors"
              >
                <HiOutlinePlus className="w-4 h-4" />
                添加组件
              </button>
            )}
            <button
              onClick={resetLayout}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white/60 px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-white transition-colors"
            >
              <HiOutlineArrowPath className="w-4 h-4" />
              重置
            </button>
            <button
              onClick={() => {
                onExitEdit();
                setShowAddPanel(false);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary-600 transition-colors shadow-sm"
            >
              <HiOutlineCheck className="w-4 h-4" />
              完成
            </button>
          </div>
        </div>
      )}

      {editMode && showAddPanel && (
        <AddWidgetPanel
          availableIds={addableIds}
          onAdd={addWidget}
          onClose={() => setShowAddPanel(false)}
        />
      )}

      <ResponsiveGridLayout
        className="layout"
        layouts={layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={80}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".drag-handle"
        onLayoutChange={handleLayoutChange}
        useCSSTransforms
      >
        {layout.map((item) => {
          const def = visibleWidgets.find((w) => w.id === item.i);
          if (!def) return null;
          const Component = def.component;
          return (
            <div key={item.i}>
              <WidgetCard
                title={def.title}
                editMode={editMode}
                onRemove={() => removeWidget(item.i)}
              >
                <Component data={data} isAdmin={isAdmin} userRole={userRole} />
              </WidgetCard>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
