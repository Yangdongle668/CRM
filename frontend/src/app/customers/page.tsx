'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import VirtualList from '@/components/ui/VirtualList';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/contexts/auth-context';
import { customersApi } from '@/lib/api';
import { useInfiniteList } from '@/lib/useInfiniteList';
import { CUSTOMER_STATUS_MAP, CUSTOMER_SOURCES, INDUSTRIES } from '@/lib/constants';
import CountrySelect from '@/components/ui/CountrySelect';
import type { Customer, CustomerStatus, PaginatedData } from '@/types';

const initialForm = {
  companyName: '',
  country: '',
  address: '',
  website: '',
  website2: '',
  industry: '',
  scale: '',
  source: '',
  status: 'POTENTIAL' as CustomerStatus,
  remark: '',
};

const PAGE_SIZE = 50;
const ROW_HEIGHT = 56;

export default function CustomersPage() {
  const router = useRouter();
  const { isAdmin, can } = useAuth();
  // Prefer an explicit permission if the server exposes it; otherwise
  // fall back to the admin-role shortcut (keeps behaviour unchanged for
  // unmigrated environments).
  const canDelete = can ? can('customer:delete') : isAdmin;

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  // The applied query — updated on search submit / filter change.
  const [appliedQuery, setAppliedQuery] = useState({
    search: '',
    status: '',
    country: '',
  });

  // Create modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPage = useCallback(
    async (page: number, pageSize: number) => {
      const params: Record<string, any> = { page, pageSize };
      if (appliedQuery.search) params.search = appliedQuery.search;
      if (appliedQuery.status) params.status = appliedQuery.status;
      if (appliedQuery.country) params.country = appliedQuery.country;
      const res: any = await customersApi.list(params);
      const data: PaginatedData<Customer> = res.data;
      return { items: data.items, total: data.total };
    },
    [appliedQuery],
  );

  const {
    items: customers,
    total,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
  } = useInfiniteList<Customer>({
    pageSize: PAGE_SIZE,
    fetchPage,
    deps: [appliedQuery],
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery({
      search,
      status: statusFilter,
      country: countryFilter,
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      toast.error('请输入公司名称');
      return;
    }
    setSubmitting(true);
    try {
      await customersApi.create(form);
      toast.success('客户创建成功');
      setModalOpen(false);
      setForm(initialForm);
      void refresh();
    } catch {
      // error handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await customersApi.delete(deleteId);
      toast.success('客户已删除');
      setDeleteId(null);
      void refresh();
    } catch {
      // error handled by interceptor
    } finally {
      setDeleting(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">客户管理</h1>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            新建客户
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索公司名称..."
              className="w-full max-w-sm rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>
          <select
            value={statusFilter}
            onChange={(e) => {
              const v = e.target.value;
              setStatusFilter(v);
              setAppliedQuery((q) => ({ ...q, status: v }));
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">全部状态</option>
            {Object.entries(CUSTOMER_STATUS_MAP).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
          <div className="w-48">
            <CountrySelect
              value={countryFilter}
              onChange={(v) => {
                setCountryFilter(v);
                setAppliedQuery((q) => ({ ...q, country: v }));
              }}
              placeholder="全部国家"
            />
          </div>
        </div>

        {/* Virtualized table: header + windowed body + infinite scroll. */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* Header (static). Grid columns kept in sync with row template. */}
          <div
            className="grid bg-gray-50 border-b border-gray-200 px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500"
            style={{
              gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px',
            }}
          >
            <div>公司名称</div>
            <div>国家</div>
            <div>行业</div>
            <div>状态</div>
            <div>负责人</div>
            <div>创建时间</div>
            <div className="text-right">操作</div>
          </div>

          {loading && customers.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">加载中...</div>
          ) : (
            <VirtualList
              items={customers}
              rowHeight={ROW_HEIGHT}
              onEndReached={() => {
                if (hasMore && !loadingMore) void loadMore();
              }}
              getKey={(c) => c.id}
              empty={
                <div className="py-12 text-center text-sm text-gray-500">
                  暂无客户数据
                </div>
              }
              footer={
                <div className="px-6 py-3 text-center text-xs text-gray-400 border-t border-gray-100">
                  {loadingMore
                    ? '加载中...'
                    : hasMore
                      ? `已加载 ${customers.length} / ${total}，继续向下滚动自动加载`
                      : `已显示全部 ${customers.length} 条`}
                </div>
              }
              renderRow={(customer) => {
                const statusInfo = CUSTOMER_STATUS_MAP[customer.status];
                return (
                  <div
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="grid items-center px-6 border-b border-gray-100 cursor-pointer hover:bg-gray-50 text-sm"
                    style={{
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px',
                      height: ROW_HEIGHT,
                    }}
                  >
                    <div className="font-medium text-gray-900 truncate pr-2">
                      {customer.companyName}
                    </div>
                    <div className="text-gray-500 truncate pr-2">{customer.country || '-'}</div>
                    <div className="text-gray-500 truncate pr-2">{customer.industry || '-'}</div>
                    <div>
                      <Badge className={statusInfo?.color || ''}>
                        {statusInfo?.label || customer.status}
                      </Badge>
                    </div>
                    <div className="text-gray-500 truncate pr-2">
                      {customer.owner?.name || '-'}
                    </div>
                    <div className="text-gray-500 truncate pr-2">
                      {new Date(customer.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                    <div className="text-right">
                      {canDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(customer.id);
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      {/* Create Customer Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="新建客户" maxWidth="2xl" dismissible={false}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                公司名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">国家</label>
              <CountrySelect
                value={form.country}
                onChange={(v) => updateField('country', v)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">行业</label>
              <select
                value={form.industry}
                onChange={(e) => updateField('industry', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">请选择</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">地址</label>
              <textarea
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                placeholder="可换行输入详细地址"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">网站 1</label>
              <input
                type="text"
                value={form.website}
                onChange={(e) => updateField('website', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">网站 2</label>
              <input
                type="text"
                value={(form as any).website2 || ''}
                onChange={(e) => updateField('website2', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="https://example2.com（可选）"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">规模</label>
              <input
                type="text"
                value={form.scale}
                onChange={(e) => updateField('scale', e.target.value)}
                placeholder="例如：50-100人"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">来源</label>
              <select
                value={form.source}
                onChange={(e) => updateField('source', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">请选择</option>
                {CUSTOMER_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">状态</label>
              <select
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(CUSTOMER_STATUS_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
              <textarea
                value={form.remark}
                onChange={(e) => updateField('remark', e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="删除客户"
        message="确定要删除该客户吗？此操作不可撤销。"
        confirmText="删除"
        loading={deleting}
      />
    </AppLayout>
  );
}
