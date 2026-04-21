'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineMagnifyingGlass,
  HiOutlineDocumentText,
  HiOutlineArrowDownTray,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineCheck,
  HiOutlineXMark,
  HiOutlineCheckCircle,
  HiOutlineClock,
} from 'react-icons/hi2';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { useAuth } from '@/contexts/auth-context';
import { pisApi, customersApi } from '@/lib/api';
import { celebrate } from '@/lib/celebrate';
import { PI_STATUS_MAP } from '@/lib/constants';
import type { ProformaInvoice, Customer } from '@/types';

type TabKey = 'mine' | 'all' | 'pending';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'mine', label: '我的PI' },
  { key: 'all', label: '全部PI' },
  { key: 'pending', label: '待审核' },
];

export default function PIsPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('mine');
  const [pis, setPis] = useState<ProformaInvoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPIs = async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize };

      if (searchKeyword) params.keyword = searchKeyword;

      if (activeTab === 'pending' && isAdmin) {
        params.status = 'PENDING_APPROVAL';
      } else if (activeTab === 'all' && isAdmin) {
        if (statusFilter) params.status = statusFilter;
      } else {
        if (statusFilter) params.status = statusFilter;
      }

      const res: any = await pisApi.list(params);
      const data = res.data;
      setPis(data?.items || []);
      setTotal(data?.total || 0);
    } catch {
      toast.error('加载PI失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res: any = await customersApi.list({ pageSize: 999 });
      setCustomers(res.data?.items || []);
    } catch {
      // Silently fail
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    setPage(1);
    fetchPIs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, statusFilter]);

  // Debounce keyword search
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      fetchPIs();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKeyword]);

  useEffect(() => {
    if (page > 1) fetchPIs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const customerMap = useMemo(() => {
    const m: Record<string, string> = {};
    customers.forEach((c) => {
      m[c.id] = c.companyName;
    });
    return m;
  }, [customers]);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    pis.forEach((p) => {
      byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    });
    return byStatus;
  }, [pis]);

  const handleApprove = async (piId: string) => {
    try {
      await pisApi.approve(piId);
      toast.success('PI已批准');
      celebrate();
      fetchPIs();
    } catch {
      toast.error('批准失败');
    }
  };

  const openRejectModal = (piId: string) => {
    setRejectTargetId(piId);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectTargetId) return;
    if (!rejectReason.trim()) {
      toast.error('请填写拒绝原因');
      return;
    }
    setRejecting(true);
    try {
      await pisApi.reject(rejectTargetId, rejectReason.trim());
      toast.success('PI已拒绝');
      setRejectModalOpen(false);
      fetchPIs();
    } catch {
      toast.error('拒绝失败');
    } finally {
      setRejecting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await pisApi.delete(deletingId);
      toast.success('PI已删除');
      setDeleteModalOpen(false);
      setDeletingId(null);
      fetchPIs();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadPdf = async (piId: string) => {
    try {
      const res: any = await pisApi.downloadPdf(piId);
      const pi = pis.find((p) => p.id === piId);
      const blob =
        res instanceof Blob
          ? res
          : new Blob([JSON.stringify(res)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pi?.piNo || 'PI'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('下载失败');
    }
  };

  const visibleTabs = isAdmin ? TABS : TABS.slice(0, 1);

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-gray-900">
              形式发票 (PI)
            </h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              创建、管理和审批外贸形式发票。支持多银行账户和模板复用。
            </p>
          </div>
          <button
            onClick={() => router.push('/pis/new')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2 text-[13px] font-medium text-white shadow-apple transition-all hover:bg-primary-600 active:scale-[0.98]"
          >
            <HiOutlinePlus className="h-4 w-4" />
            新建PI
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
          <StatCard
            icon={<HiOutlineDocumentText className="h-4 w-4" />}
            label="当前列表"
            value={total}
            tone="neutral"
          />
          <StatCard
            icon={<HiOutlineClock className="h-4 w-4" />}
            label="待审核"
            value={stats.PENDING_APPROVAL || 0}
            tone="warning"
          />
          <StatCard
            icon={<HiOutlineCheckCircle className="h-4 w-4" />}
            label="已批准"
            value={stats.APPROVED || 0}
            tone="success"
          />
          <StatCard
            icon={<HiOutlineXMark className="h-4 w-4" />}
            label="已拒绝"
            value={stats.REJECTED || 0}
            tone="danger"
          />
        </div>

        {/* Tabs + filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200/80">
          <nav className="flex gap-1">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative px-4 py-2.5 text-[13px] font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'text-primary-600'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary-500" />
                )}
              </button>
            ))}
          </nav>

          <div className="flex w-full items-center gap-2 pb-2 sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <HiOutlineMagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索PI号或收货人..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full sm:w-64 rounded-xl border border-gray-200 bg-white/70 pl-9 pr-3 py-2 text-[13px] text-gray-800 placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            {activeTab !== 'pending' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-[13px] text-gray-800 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">全部状态</option>
                <option value="DRAFT">草稿</option>
                <option value="PENDING_APPROVAL">待审核</option>
                <option value="APPROVED">已批准</option>
                <option value="REJECTED">已拒绝</option>
              </select>
            )}
          </div>
        </div>

        {/* Table —— <md 可横向滚；≥md 正常展示 */}
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-apple">
          <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-gray-200/80 bg-gray-50/50 text-[12px] uppercase tracking-wider text-gray-500">
                <th className="px-5 py-3 text-left font-medium">PI号</th>
                <th className="px-5 py-3 text-left font-medium">客户</th>
                <th className="px-5 py-3 text-left font-medium">收货人</th>
                <th className="px-5 py-3 text-right font-medium">金额</th>
                <th className="px-5 py-3 text-left font-medium">银行</th>
                <th className="px-5 py-3 text-left font-medium">状态</th>
                <th className="px-5 py-3 text-left font-medium">创建日期</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-[13px]">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    加载中...
                  </td>
                </tr>
              ) : pis.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400">
                    暂无PI数据
                  </td>
                </tr>
              ) : (
                pis.map((pi) => {
                  const statusCfg = PI_STATUS_MAP[pi.status] || {
                    label: pi.status,
                    color: 'bg-gray-100 text-gray-700',
                  };
                  return (
                    <tr
                      key={pi.id}
                      className="group transition-colors hover:bg-gray-50/70"
                    >
                      <td className="px-5 py-3">
                        <button
                          onClick={() => router.push(`/pis/${pi.id}`)}
                          className="font-medium text-primary-600 hover:underline"
                        >
                          {pi.piNo}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-gray-700">
                        {pi.customer?.companyName || customerMap[pi.customerId] || '-'}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {pi.consigneeName || '-'}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900 tabular-nums">
                        {pi.currency} {Number(pi.totalAmount).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-5 py-3 text-gray-600">
                        {pi.bankAccount?.alias || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge className={statusCfg.color}>{statusCfg.label}</Badge>
                      </td>
                      <td className="px-5 py-3 text-gray-500 tabular-nums">
                        {new Date(pi.createdAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="编辑"
                            onClick={() => router.push(`/pis/${pi.id}`)}
                          >
                            <HiOutlinePencilSquare className="h-4 w-4" />
                          </IconButton>
                          {(pi.status === 'APPROVED' || isAdmin) && pi.status !== 'DRAFT' && (
                            <IconButton
                              title="下载PDF"
                              onClick={() => handleDownloadPdf(pi.id)}
                            >
                              <HiOutlineArrowDownTray className="h-4 w-4" />
                            </IconButton>
                          )}
                          {isAdmin && pi.status === 'PENDING_APPROVAL' && (
                            <>
                              <IconButton
                                title="批准"
                                onClick={() => handleApprove(pi.id)}
                                tone="success"
                              >
                                <HiOutlineCheck className="h-4 w-4" />
                              </IconButton>
                              <IconButton
                                title="拒绝"
                                onClick={() => openRejectModal(pi.id)}
                                tone="danger"
                              >
                                <HiOutlineXMark className="h-4 w-4" />
                              </IconButton>
                            </>
                          )}
                          <IconButton
                            title="删除"
                            tone="danger"
                            onClick={() => {
                              setDeletingId(pi.id);
                              setDeleteModalOpen(true);
                            }}
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <Pagination
            current={page}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
          />
        )}
      </div>

      {/* Reject Modal */}
      <Modal
        open={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="拒绝 PI"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-gray-600">
            请填写拒绝原因，系统会保留该信息给提交人。
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            placeholder="例如：单价与合同不符，请重新核对…"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-[13px] focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setRejectModalOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={confirmReject}
              disabled={rejecting}
              className="rounded-xl bg-red-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {rejecting ? '提交中...' : '确认拒绝'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="删除 PI"
      >
        <div className="space-y-4">
          <p className="text-[13px] text-gray-600">
            确定要删除这份 PI 吗？此操作无法撤销。
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteModalOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-xl bg-red-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
            >
              {deleting ? '删除中...' : '确认删除'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

// ==================== Sub-components ====================

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const toneClass = {
    neutral: 'bg-gray-100 text-gray-600',
    success: 'bg-emerald-100 text-emerald-600',
    warning: 'bg-amber-100 text-amber-600',
    danger: 'bg-red-100 text-red-600',
  }[tone];

  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-apple">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-gray-500">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>
          {icon}
        </span>
      </div>
      <div className="mt-2 text-[22px] font-semibold tracking-tight text-gray-900 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  tone?: 'success' | 'danger';
}) {
  const toneClass = tone === 'success'
    ? 'text-emerald-600 hover:bg-emerald-50'
    : tone === 'danger'
    ? 'text-red-600 hover:bg-red-50'
    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700';

  return (
    <button
      title={title}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${toneClass}`}
    >
      {children}
    </button>
  );
}
