'use client';

import React, { useCallback, useMemo, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import VirtualList from '@/components/ui/VirtualList';
import { useInfiniteList } from '@/lib/useInfiniteList';
import { useAuth } from '@/contexts/auth-context';
import { auditApi } from '@/lib/api';

interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  method: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
  status: 'SUCCESS' | 'FAILURE';
  errorMessage: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

const PAGE_SIZE = 100;
const ROW_HEIGHT = 64;

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditLogsPage() {
  const { can, isAdmin, loading: authLoading } = useAuth();
  const allowed = can ? can('audit:read') : isAdmin;

  const [filters, setFilters] = useState({
    search: '',
    action: '',
    status: '',
    targetType: '',
    from: '',
    to: '',
  });
  const [applied, setApplied] = useState(filters);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (page: number, pageSize: number) => {
      const params: Record<string, any> = { page, pageSize };
      for (const [k, v] of Object.entries(applied)) {
        if (v) params[k] = v;
      }
      const res: any = await auditApi.list(params);
      return { items: res.data.items, total: res.data.total };
    },
    [applied],
  );

  const {
    items,
    total,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
  } = useInfiniteList<AuditLog>({
    pageSize: PAGE_SIZE,
    fetchPage,
    deps: [applied],
  });

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setApplied(filters);
  };

  const statusClass = (s: string) =>
    s === 'SUCCESS'
      ? 'bg-green-100 text-green-700'
      : 'bg-red-100 text-red-700';

  const actionLabel = useMemo(
    () => (action: string) => {
      // Render "customer.delete" → "客户 · 删除" style using a dictionary.
      const dict: Record<string, string> = {
        'auth.login': '登录',
        'customer.delete': '客户 · 删除',
        'order.update': '订单 · 修改',
        'order.delete': '订单 · 删除',
        'order.status.update': '订单 · 状态变更',
        'order.payment.update': '订单 · 收款变更',
        'order.price.update': '订单 · 价格变更',
        'user.update': '用户 · 修改',
        'user.delete': '用户 · 删除',
        'backup.export': '备份 · 导出',
        'backup.import': '备份 · 导入',
        'rbac.role.update': '权限 · 角色配置',
      };
      return dict[action] || action;
    },
    [],
  );

  if (authLoading) {
    return <AppLayout><div className="p-8 text-gray-500">加载中...</div></AppLayout>;
  }
  if (!allowed) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-gray-500">
          你没有查看审计日志的权限（<code>audit:read</code>）。
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">审计日志</h1>
          <button
            onClick={() => void refresh()}
            className="self-start sm:self-auto rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            刷新
          </button>
        </div>

        {/* Filters */}
        <form onSubmit={applyFilters} className="flex flex-wrap gap-3">
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="搜索（用户 / 动作 / 目标）"
            className="flex-1 min-w-[240px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="text"
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            placeholder="action 码（如 customer.delete）"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56"
          />
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">全部状态</option>
            <option value="SUCCESS">成功</option>
            <option value="FAILURE">失败</option>
          </select>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            筛选
          </button>
        </form>

        {/* Virtualized log list */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div
            className="grid bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500"
            style={{ gridTemplateColumns: '160px 160px 180px 1fr 110px 120px 90px' }}
          >
            <div>时间</div>
            <div>用户</div>
            <div>动作</div>
            <div>目标</div>
            <div>IP</div>
            <div>路径</div>
            <div>状态</div>
          </div>

          {loading && items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">加载中...</div>
          ) : (
            <VirtualList
              items={items}
              rowHeight={ROW_HEIGHT}
              onEndReached={() => {
                if (hasMore && !loadingMore) void loadMore();
              }}
              getKey={(r) => r.id}
              empty={
                <div className="py-12 text-center text-sm text-gray-500">
                  无匹配的审计日志
                </div>
              }
              footer={
                <div className="px-4 py-2 text-center text-xs text-gray-400 border-t border-gray-100">
                  {loadingMore
                    ? '加载中...'
                    : hasMore
                      ? `已加载 ${items.length} / ${total}，继续向下滚动自动加载`
                      : `共 ${total} 条`}
                </div>
              }
              renderRow={(log) => {
                const isOpen = expanded === log.id;
                return (
                  <div className="border-b border-gray-100">
                    <div
                      onClick={() => setExpanded(isOpen ? null : log.id)}
                      className="grid items-center px-4 py-3 text-sm cursor-pointer hover:bg-gray-50"
                      style={{
                        gridTemplateColumns: '160px 160px 180px 1fr 110px 120px 90px',
                        height: ROW_HEIGHT,
                      }}
                    >
                      <div className="text-gray-500 truncate">
                        {fmtDate(log.createdAt)}
                      </div>
                      <div className="truncate">
                        <div className="text-gray-900">{log.userName || '—'}</div>
                        <div className="text-xs text-gray-400 truncate">
                          {log.userEmail || (log.userId ? log.userId : '匿名')}
                        </div>
                      </div>
                      <div className="font-mono text-gray-700 truncate">
                        {actionLabel(log.action)}
                      </div>
                      <div className="truncate text-gray-600">
                        {log.targetLabel
                          ? `${log.targetType || ''}: ${log.targetLabel}`
                          : log.targetId
                            ? `${log.targetType || ''}#${log.targetId.slice(0, 8)}`
                            : '—'}
                      </div>
                      <div className="text-gray-500 font-mono text-xs truncate">
                        {log.ip || '—'}
                      </div>
                      <div className="text-gray-500 font-mono text-xs truncate">
                        {log.method} {log.path}
                      </div>
                      <div>
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusClass(log.status)}`}
                        >
                          {log.status === 'SUCCESS' ? '成功' : '失败'}
                        </span>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-4 py-3 bg-gray-50 text-xs text-gray-700 border-t border-gray-100">
                        {log.errorMessage && (
                          <div className="mb-2 text-red-600">
                            错误: {log.errorMessage}
                          </div>
                        )}
                        {log.userAgent && (
                          <div className="mb-2 text-gray-500 break-all">
                            User-Agent: {log.userAgent}
                          </div>
                        )}
                        {log.metadata && (
                          <pre className="whitespace-pre-wrap break-all rounded bg-white border border-gray-200 p-2 text-gray-700 overflow-x-auto">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              }}
              estimateSize={(i) => (expanded === items[i]?.id ? 220 : ROW_HEIGHT)}
            />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
