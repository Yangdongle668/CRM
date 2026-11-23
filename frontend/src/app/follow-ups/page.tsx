'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { followUpsApi, usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { LEAD_STAGE_MAP } from '@/lib/constants';
import type { FollowUp, FollowUpStatus, User } from '@/types';
import toast from 'react-hot-toast';

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  PENDING: '待跟进',
  DONE: '已跟进',
  DISMISSED: '已取消',
  SNOOZED: '已延后',
};

const STATUS_COLOR: Record<FollowUpStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  DONE: 'bg-green-100 text-green-700',
  DISMISSED: 'bg-gray-100 text-gray-600',
  SNOOZED: 'bg-blue-100 text-blue-700',
};

const REASON_LABEL: Record<string, string> = {
  CUSTOMER_EMAIL_AI: '邮件 AI 待办',
  AI_RESOLVED: 'AI 判断已完成',
  AI_DROPPED: 'AI 判断不再需要',
  AI_MERGED: 'AI 合并重复',
  AI_SUPERSEDED: '被新分析取代',
  AI_STALE: '来源邮件已过期',
  FIRST_OUTREACH: '首次外发',
  RENEWED: '再次外发',
  STAGE_CHANGED: '阶段变化',
  REPLIED: '对方已回信',
  MANUAL: '手动创建',
  MANUAL_DONE: '手动完成',
  MANUAL_DISMISSED: '手动取消',
  SNOOZED_AGAIN: '延后',
  LEAD_CLOSED: '线索已结案',
  REASSIGNED: '已转派',
};

function formatDue(dateStr: string): { label: string; overdue: boolean } {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffMs < 0) {
    const absDays = Math.ceil(-diffMs / 86400000);
    return { label: `已逾期 ${absDays} 天`, overdue: true };
  }
  if (diffDays === 0) return { label: '今天到期', overdue: false };
  if (diffDays === 1) return { label: '明天', overdue: false };
  return { label: `${diffDays} 天后`, overdue: false };
}

const isEmailTask = ({ id, customerId }: FollowUp) => !!customerId && id.startsWith('email-ai-');
/** 邮件 AI 待办按来源邮件时间排时间线；来源邮件不可见时退回待办建立时间。 */
const emailTime = (task: FollowUp) => new Date(task.sourceEmailAt || task.createdAt).getTime();

const formatEmailTime = (task: FollowUp) => task.sourceEmailAt
  ? new Date(task.sourceEmailAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
  : '来源邮件时间未知';

export default function FollowUpsPage() {
  const { user, isAdmin } = useAuth();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<FollowUpStatus | 'ALL'>('PENDING');
  const [ownerFilter, setOwnerFilter] = useState<string>(''); // 仅 ADMIN
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [customerFilter, setCustomerFilter] = useState(''); // 邮件 AI 待办按客户筛选
  const [customerOptions, setCustomerOptions] = useState<Array<{ id: string; name: string; count: number }>>([]);
  const [newestFirst, setNewestFirst] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [reassignTarget, setReassignTarget] = useState<FollowUp | null>(null);
  const [reassignOwnerId, setReassignOwnerId] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const status = statusFilter === 'ALL' ? undefined : statusFilter;
    try {
      const [res, customers]: any[] = await Promise.all([
        followUpsApi.list({
          ownerId: isAdmin ? ownerFilter || undefined : undefined,
          status,
          overdueOnly,
          customerId: customerFilter || undefined,
        }),
        followUpsApi.aiCustomers({ status, overdueOnly }).catch(() => null),
      ]);
      setItems(res.data?.items || []);
      if (customers) setCustomerOptions(customers.data || []);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, ownerFilter, statusFilter, overdueOnly, customerFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!isAdmin) return;
    usersApi
      .list()
      .then((res: any) => setUsers(res.data?.items || res.data || []))
      .catch(() => {});
  }, [isAdmin]);

  const handleDone = async (fu: FollowUp) => {
    try {
      await followUpsApi.done(fu.id);
      toast.success('已标记完成');
      fetchItems();
    } catch {
      /* interceptor handles */
    }
  };

  const handleSnooze = async (fu: FollowUp, days: number) => {
    try {
      await followUpsApi.snooze(fu.id, days);
      toast.success(`已推后 ${days} 天`);
      fetchItems();
    } catch {
      /* interceptor handles */
    }
  };

  const handleDismiss = async (fu: FollowUp) => {
    if (!confirm('取消这条跟进？取消后不会再提醒。')) return;
    try {
      await followUpsApi.dismiss(fu.id);
      toast.success('已取消');
      fetchItems();
    } catch {
      /* interceptor handles */
    }
  };

  const handleReassignSubmit = async () => {
    if (!reassignTarget || !reassignOwnerId) return;
    try {
      await followUpsApi.reassign(reassignTarget.id, reassignOwnerId);
      toast.success('已转派');
      setReassignTarget(null);
      setReassignOwnerId('');
      fetchItems();
    } catch {
      /* interceptor handles */
    }
  };

  const statusOptions: Array<{ key: FollowUpStatus | 'ALL'; label: string }> = [
    { key: 'PENDING', label: '待跟进' },
    { key: 'DONE', label: '已跟进' },
    { key: 'DISMISSED', label: '已取消' },
    { key: 'ALL', label: '全部' },
  ];

  const otherItems = customerFilter ? [] : items.filter((item) => !isEmailTask(item));
  // 邮件 AI 待办按客户分组；组内按来源邮件时间排成时间线，客户按最近一封来源邮件排序
  const emailGroups = useMemo(() => {
    const direction = newestFirst ? -1 : 1;
    const groups = new Map<string, FollowUp[]>();
    for (const task of items) {
      if (!isEmailTask(task)) continue;
      const list = groups.get(task.customerId!) ?? [];
      list.push(task);
      groups.set(task.customerId!, list);
    }
    return Array.from(groups.entries())
      .map(([customerId, tasks]) => {
        tasks.sort((a, b) => direction * (emailTime(a) - emailTime(b)));
        return { customerId, name: tasks[0].customerName || '客户邮件待办', tasks, latest: Math.max(...tasks.map(emailTime)) };
      })
      .sort((a, b) => b.latest - a.latest);
  }, [items, newestFirst]);
  const selectedMissing = customerFilter && !customerOptions.some(({ id }) => id === customerFilter);

  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">跟进</h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            向线索发出邮件后自动建立提醒；对方回信或手动完成后自动关闭。
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg bg-white border border-gray-200 px-3 sm:px-4 py-3 shadow-sm">
          <div className="flex gap-1 flex-wrap">
            {statusOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setStatusFilter(opt.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  statusFilter === opt.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            仅显示逾期
          </label>

          <select
            aria-label="按客户筛选邮件 AI 待办"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="max-w-full rounded-lg border border-gray-300 px-2 py-1 text-xs sm:max-w-xs"
          >
            <option value="">全部客户（邮件 AI 待办）</option>
            {selectedMissing && <option value={customerFilter}>当前客户（0）</option>}
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.count}）
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setNewestFirst((v) => !v)}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            title="切换邮件时间线顺序"
          >
            邮件时间 · {newestFirst ? '最新在前' : '最早在前'}
          </button>

          {isAdmin && (
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="">全员负责人</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {customerFilter && !loading && emailGroups.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">
            该客户在当前筛选下没有邮件 AI 待办。
            <button type="button" className="ml-2 text-blue-700 underline" onClick={() => setCustomerFilter('')}>
              查看全部客户
            </button>
          </div>
        )}

        {emailGroups.map((group) => (
          <section key={group.customerId} aria-label={`${group.name} 的邮件 AI 待办`} aria-busy={loading}
            className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/customers/${group.customerId}?tab=emails`}
                  className="break-words font-semibold text-blue-700 hover:underline">
                  {group.name}
                </Link>
                <span className="ml-2 text-xs text-gray-500">邮件 AI 待办 {group.tasks.length} 条</span>
              </div>
              {!customerFilter && (
                <button type="button" className="text-xs text-blue-700 hover:underline"
                  onClick={() => setCustomerFilter(group.customerId)}>
                  只看该客户
                </button>
              )}
            </header>
            <ol className="relative mx-4 my-3 space-y-4 border-l-2 border-gray-200 pl-5">
              {group.tasks.map((task) => {
                const sourceUrl = task.triggerEmailId
                  ? `/emails?emailId=${encodeURIComponent(task.triggerEmailId)}`
                  : `/customers/${task.customerId}?tab=emails`;
                const overdue = task.status === 'PENDING' && formatDue(task.dueAt).overdue;
                return (
                  <li key={task.id} className="relative">
                    <span aria-hidden className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
                      task.status === 'PENDING' ? (overdue ? 'bg-red-500' : 'bg-amber-500') : 'bg-gray-300'}`} />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <time className="font-medium text-gray-700">{formatEmailTime(task)}</time>
                      <span>· {task.contactName || task.contactEmail || '对接人未识别'}</span>
                      <Badge className={STATUS_COLOR[task.status]}>{STATUS_LABEL[task.status]}</Badge>
                      {task.status !== 'PENDING' && task.reason && (
                        <span className="text-gray-400">{REASON_LABEL[task.reason] || task.reason}</span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900">{task.notes}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={overdue ? 'font-semibold text-red-600' : 'text-gray-500'}>
                        到期 {new Date(task.dueAt).toLocaleDateString('zh-CN')}
                        {task.status === 'PENDING' ? `（${formatDue(task.dueAt).label}）` : ''}
                      </span>
                      {task.triggerEmailId ? (
                        <Link href={sourceUrl} className="text-blue-700 underline">查看来源邮件</Link>
                      ) : <span className="text-gray-400">来源邮件不可用</span>}
                      {task.status === 'PENDING' && (
                        <>
                          <button type="button" className="text-green-700" onClick={() => handleDone(task)}>标记已完成</button>
                          <button type="button" className="text-blue-700" onClick={() => handleSnooze(task, 3)}>+3 天</button>
                          <button type="button" className="text-gray-600" onClick={() => handleDismiss(task)}>取消</button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        {/* List */}
        {!customerFilter && (loading || otherItems.length > 0 || emailGroups.length === 0) && (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* 移动端卡片 */}
          <div className="md:hidden divide-y divide-gray-100">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">加载中...</div>
            ) : otherItems.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">暂无跟进</div>
            ) : (
              otherItems.map((fu) => {
                const due = formatDue(fu.dueAt);
                const stageLabel = fu.lead?.stage
                  ? LEAD_STAGE_MAP[fu.lead.stage]?.label || fu.lead.stage
                  : '';
                const overdue = fu.status === 'PENDING' && due.overdue;
                return (
                  <div key={fu.id} className={`px-4 py-3 ${overdue ? 'bg-red-50/50' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {fu.lead ? (
                          <Link href={`/leads?highlight=${fu.lead.id}`} className="block">
                            <div className="text-sm font-semibold text-gray-900 truncate">
                              {fu.lead.companyName || fu.lead.title}
                            </div>
                            <div className="mt-0.5 text-[11px] text-gray-500 truncate">
                              {stageLabel}
                              {fu.lead.country ? ` · ${fu.lead.country}` : ''}
                              {fu.lead.email ? ` · ${fu.lead.email}` : ''}
                            </div>
                          </Link>
                        ) : (
                          fu.customerId ? (
                            <Link href={`/customers/${fu.customerId}?tab=emails`} className="text-sm text-blue-700 hover:underline">
                              <span className="block font-medium">{fu.customerName || '客户邮件待办'}</span>
                              <span className="block text-xs text-gray-500">
                                对接人 · {fu.contactName || fu.contactEmail || '未识别'}
                                {fu.contactName && fu.contactEmail ? `（${fu.contactEmail}）` : ''}
                              </span>
                              {fu.notes && <span className="mt-1 block">{fu.notes}</span>}
                            </Link>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )
                        )}
                      </div>
                      <Badge className={STATUS_COLOR[fu.status]}>
                        {STATUS_LABEL[fu.status]}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                      <span className={overdue ? 'font-semibold text-red-600' : ''}>
                        {due.label}
                        <span className="ml-1.5 text-gray-400">
                          {new Date(fu.dueAt).toLocaleDateString('zh-CN')}
                        </span>
                      </span>
                      {fu.reason && (
                        <span className="text-gray-400">
                          · {REASON_LABEL[fu.reason] || fu.reason}
                        </span>
                      )}
                      {isAdmin && fu.owner?.name && (
                        <span className="text-gray-400">· {fu.owner.name}</span>
                      )}
                    </div>
                    {fu.status === 'PENDING' ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleDone(fu)}
                          className="rounded px-2 py-1 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100"
                        >
                          已跟进
                        </button>
                        <button
                          onClick={() => handleSnooze(fu, 3)}
                          className="rounded px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100"
                          title="推后 3 天"
                        >
                          +3 天
                        </button>
                        <button
                          onClick={() => handleDismiss(fu)}
                          className="rounded px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                        >
                          取消
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setReassignTarget(fu);
                              setReassignOwnerId(fu.ownerId);
                            }}
                            className="rounded px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                          >
                            转派
                          </button>
                        )}
                      </div>
                    ) : (
                      fu.completedAt && (
                        <div className="mt-1.5 text-[11px] text-gray-400">
                          于 {new Date(fu.completedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* 桌面端表格 */}
          <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr className="text-xs uppercase text-gray-500">
                <th className="px-4 py-2 text-left font-semibold">线索 / 客户待办</th>
                <th className="px-4 py-2 text-left font-semibold">状态</th>
                <th className="px-4 py-2 text-left font-semibold">到期</th>
                <th className="px-4 py-2 text-left font-semibold">原因</th>
                {isAdmin && (
                  <th className="px-4 py-2 text-left font-semibold">负责人</th>
                )}
                <th className="px-4 py-2 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : otherItems.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-4 py-10 text-center text-gray-400">
                    暂无跟进
                  </td>
                </tr>
              ) : (
                otherItems.map((fu) => {
                  const due = formatDue(fu.dueAt);
                  const stageLabel = fu.lead?.stage
                    ? LEAD_STAGE_MAP[fu.lead.stage]?.label || fu.lead.stage
                    : '';
                  return (
                    <tr key={fu.id} className={fu.status === 'PENDING' && due.overdue ? 'bg-red-50/50' : ''}>
                      <td className="px-4 py-2">
                        {fu.lead ? (
                          <Link
                            href={`/leads?highlight=${fu.lead.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            <div className="font-medium text-gray-900">
                              {fu.lead.companyName || fu.lead.title}
                            </div>
                            <div className="text-xs text-gray-500">
                              {stageLabel}
                              {fu.lead.country ? ` · ${fu.lead.country}` : ''}
                              {fu.lead.email ? ` · ${fu.lead.email}` : ''}
                            </div>
                          </Link>
                        ) : (
                          fu.customerId ? (
                            <Link href={`/customers/${fu.customerId}?tab=emails`} className="text-sm text-blue-700 hover:underline">
                              <span className="block font-medium">{fu.customerName || '客户邮件待办'}</span>
                              <span className="block text-xs text-gray-500">
                                对接人 · {fu.contactName || fu.contactEmail || '未识别'}
                                {fu.contactName && fu.contactEmail ? `（${fu.contactEmail}）` : ''}
                              </span>
                              {fu.notes && <span className="mt-1 block">{fu.notes}</span>}
                            </Link>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Badge className={STATUS_COLOR[fu.status]}>
                          {STATUS_LABEL[fu.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <span className={due.overdue && fu.status === 'PENDING' ? 'font-semibold text-red-600' : 'text-gray-600'}>
                          {due.label}
                        </span>
                        <span className="ml-2 text-xs text-gray-400">
                          {new Date(fu.dueAt).toLocaleDateString('zh-CN')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {fu.reason ? REASON_LABEL[fu.reason] || fu.reason : '-'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2 text-xs text-gray-600">
                          {fu.owner?.name || '-'}
                        </td>
                      )}
                      <td className="px-4 py-2">
                        {fu.status === 'PENDING' ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleDone(fu)}
                              className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
                            >
                              已跟进
                            </button>
                            <button
                              onClick={() => handleSnooze(fu, 3)}
                              className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                              title="推后 3 天"
                            >
                              +3 天
                            </button>
                            <button
                              onClick={() => handleDismiss(fu)}
                              className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                            >
                              取消
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setReassignTarget(fu);
                                  setReassignOwnerId(fu.ownerId);
                                }}
                                className="rounded px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                              >
                                转派
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="block text-right text-xs text-gray-400">
                            {fu.completedAt
                              ? `于 ${new Date(fu.completedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                              : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>
        )}
      </div>

      {/* 转派弹窗（ADMIN） */}
      <Modal
        open={!!reassignTarget}
        onClose={() => {
          setReassignTarget(null);
          setReassignOwnerId('');
        }}
        title="转派跟进"
        maxWidth="sm"
        dismissible={false}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            将「{reassignTarget?.lead?.companyName || reassignTarget?.lead?.title || ''}」的
            这条跟进转派给：
          </p>
          <select
            value={reassignOwnerId}
            onChange={(e) => setReassignOwnerId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">请选择</option>
            {users
              .filter((u) => u.isActive)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
          </select>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReassignTarget(null);
                setReassignOwnerId('');
              }}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleReassignSubmit}
              disabled={!reassignOwnerId}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              确认转派
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
