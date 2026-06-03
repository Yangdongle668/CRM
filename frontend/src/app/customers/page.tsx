'use client';

import React, { useState, useCallback, useEffect } from 'react';
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
  batteryModels: [] as string[],
  scale: '',
  source: '',
  status: 'POTENTIAL' as CustomerStatus,
  remark: '',
};

const PAGE_SIZE = 50;
const ROW_HEIGHT_DESKTOP = 56;
const ROW_HEIGHT_MOBILE = 116;

/** 监听 md 以下断点。VirtualList 的行高是固定 px，所以要据此切换 */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export default function CustomersPage() {
  const router = useRouter();
  const { isAdmin, can } = useAuth();
  const isMobile = useIsMobile();
  const rowHeight = isMobile ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
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

  // 导出"客户档案表" —— 用户先选状态再下载，避免误导出全表
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<
    'POTENTIAL' | 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED' | 'ALL'
  >('POTENTIAL');
  const [exporting, setExporting] = useState(false);

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

  // 搜索输入防抖 300ms 后自动触发查询（无需点击提交按钮）
  useEffect(() => {
    if (search === appliedQuery.search) return;
    const t = setTimeout(() => {
      setAppliedQuery((q) => ({ ...q, search }));
    }, 300);
    return () => clearTimeout(t);
  }, [search, appliedQuery.search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      toast.error('请输入公司名称');
      return;
    }
    // 把还没按 Enter 提交的电池型号文本也吞进去
    let payload = form;
    if (batteryInput.trim()) {
      const extras = batteryInput
        .split(/[,，\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...form.batteryModels, ...extras]));
      payload = { ...form, batteryModels: merged };
      setForm(payload);
      setBatteryInput('');
    }
    setSubmitting(true);
    try {
      await customersApi.create(payload);
      toast.success('客户创建成功');
      setModalOpen(false);
      setForm(initialForm);
      setBatteryInput('');
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

  // 电池型号 chip 输入：按 Enter / 逗号 / 中文逗号提交，支持粘贴一段以分隔符分割的清单
  const [batteryInput, setBatteryInput] = useState('');
  const commitBatteryInput = (raw: string) => {
    const parts = raw
      .split(/[,，\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setForm((prev) => {
      const set = new Set(prev.batteryModels);
      for (const p of parts) set.add(p);
      return { ...prev, batteryModels: Array.from(set) };
    });
    setBatteryInput('');
  };
  const removeBatteryModel = (model: string) => {
    setForm((prev) => ({
      ...prev,
      batteryModels: prev.batteryModels.filter((m) => m !== model),
    }));
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res: any = await customersApi.exportXlsx(exportStatus);
      const blob =
        res instanceof Blob
          ? res
          : new Blob([res], {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
      const labelMap: Record<typeof exportStatus, string> = {
        ALL: '全部客户',
        POTENTIAL: '潜在客户',
        ACTIVE: '活跃客户',
        INACTIVE: '不活跃客户',
        BLACKLISTED: '黑名单',
      };
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `客户档案表-${labelMap[exportStatus]}-${ymd}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('客户档案表已导出');
      setExportOpen(false);
    } catch {
      toast.error('导出失败，请重试');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">客户管理</h1>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              onClick={() => setExportOpen(true)}
              className="flex-1 sm:flex-none rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              导出
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="flex-1 sm:flex-none rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              新建客户
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <form onSubmit={handleSearch} className="w-full sm:flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索公司名称..."
              className="w-full sm:max-w-sm rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>
          <select
            value={statusFilter}
            onChange={(e) => {
              const v = e.target.value;
              setStatusFilter(v);
              setAppliedQuery((q) => ({ ...q, status: v }));
            }}
            className="flex-1 sm:flex-none min-w-[7rem] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">全部状态</option>
            {Object.entries(CUSTOMER_STATUS_MAP).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
          <div className="flex-1 sm:w-48 sm:flex-none min-w-[9rem]">
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

        {/* Virtualized list: header + windowed body + infinite scroll.
            桌面端按表格式网格展示；移动端同一份 VirtualList 切换成卡片渲染，
            行高随断点切换（见 ROW_HEIGHT_MOBILE / _DESKTOP）。 */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {/* 桌面端表头（移动端隐藏）。列宽与行模板保持同步。 */}
          <div
            className="hidden md:grid bg-gray-50 border-b border-gray-200 px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500"
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
              rowHeight={rowHeight}
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
                <div className="px-4 sm:px-6 py-3 text-center text-xs text-gray-400 border-t border-gray-100">
                  {loadingMore
                    ? '加载中...'
                    : hasMore
                      ? `已加载 ${customers.length} / ${total}，继续向下滚动自动加载`
                      : `已显示全部 ${customers.length} 条`}
                </div>
              }
              renderRow={(customer) => {
                const statusInfo = CUSTOMER_STATUS_MAP[customer.status];
                if (isMobile) {
                  return (
                    <div
                      onClick={() => router.push(`/customers/${customer.id}`)}
                      className="flex h-full flex-col justify-center gap-1 border-b border-gray-100 px-4 py-2 cursor-pointer hover:bg-gray-50"
                      style={{ height: rowHeight }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {customer.companyName}
                          </div>
                          {customer.customerCode && (
                            <div className="text-[11px] font-mono text-gray-400 truncate">
                              {customer.customerCode}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <Badge className={statusInfo?.color || ''}>
                            {statusInfo?.label || customer.status}
                          </Badge>
                          {canDelete && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteId(customer.id);
                              }}
                              className="text-xs text-red-600 hover:text-red-800"
                            >
                              删除
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {[customer.country, customer.industry].filter(Boolean).join(' · ') || '-'}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span className="truncate">
                          负责：{customer.owner?.name || '-'}
                        </span>
                        <span className="flex-shrink-0">
                          {new Date(customer.createdAt).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    onClick={() => router.push(`/customers/${customer.id}`)}
                    className="grid items-center px-6 border-b border-gray-100 cursor-pointer hover:bg-gray-50 text-sm"
                    style={{
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr 80px',
                      height: rowHeight,
                    }}
                  >
                    <div className="pr-2 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {customer.companyName}
                      </div>
                      {customer.customerCode && (
                        <div className="text-xs font-mono text-gray-400 truncate">
                          {customer.customerCode}
                        </div>
                      )}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <label className="mb-1 block text-sm font-medium text-gray-700">
                电池型号 <span className="text-xs font-normal text-gray-400">（回车 / 逗号添加，多个）</span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                {form.batteryModels.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                  >
                    {m}
                    <button
                      type="button"
                      onClick={() => removeBatteryModel(m)}
                      className="text-blue-400 hover:text-blue-600"
                      aria-label={`移除 ${m}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={batteryInput}
                  onChange={(e) => setBatteryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
                      e.preventDefault();
                      commitBatteryInput(batteryInput);
                    } else if (e.key === 'Backspace' && !batteryInput && form.batteryModels.length > 0) {
                      removeBatteryModel(form.batteryModels[form.batteryModels.length - 1]);
                    }
                  }}
                  onBlur={() => batteryInput && commitBatteryInput(batteryInput)}
                  placeholder={form.batteryModels.length === 0 ? '例如：18650-2600mAh' : ''}
                  className="flex-1 min-w-[120px] border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
                />
              </div>
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

      {/* Export "客户档案表" */}
      <Modal
        open={exportOpen}
        onClose={() => !exporting && setExportOpen(false)}
        title="导出客户档案表"
        maxWidth="md"
        dismissible={!exporting}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            选择要导出的客户范围，将按"客户档案表"模板（LD-SM-FM-001/A0）生成 .xlsx 文件。
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'POTENTIAL', label: '潜在客户' },
              { v: 'ACTIVE', label: '活跃客户' },
              { v: 'INACTIVE', label: '不活跃客户' },
              { v: 'BLACKLISTED', label: '黑名单' },
              { v: 'ALL', label: '全部客户' },
            ].map((opt) => {
              const selected = exportStatus === (opt.v as typeof exportStatus);
              return (
                <label
                  key={opt.v}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    selected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="exportStatus"
                    value={opt.v}
                    checked={selected}
                    onChange={() => setExportStatus(opt.v as typeof exportStatus)}
                    className="h-4 w-4 text-blue-600"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            财务状况（付款方式 / 信用额度）与其他信息列将留空，由业务员线下填写。
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setExportOpen(false)}
              disabled={exporting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {exporting ? '导出中...' : '导出'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
