'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { quotationsApi, customersApi } from '@/lib/api';
import { QUOTATION_STATUS_MAP, CURRENCIES } from '@/lib/constants';
import toast from 'react-hot-toast';
import type {
  Quotation,
  QuotationItem,
  QuotationStatus,
  Customer,
  ApiResponse,
  PaginatedData,
} from '@/types';

const emptyItem: QuotationItem = {
  productName: '',
  description: '',
  unit: '个',
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0,
};

const defaultForm = {
  customerId: '',
  title: '',
  currency: 'USD',
  validUntil: '',
  terms: '',
  remark: '',
};

export default function QuotationsPage() {
  // ---------- list state ----------
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  // ---------- filters ----------
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  // ---------- customers ----------
  const [customers, setCustomers] = useState<Customer[]>([]);

  // ---------- modal ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [items, setItems] = useState<QuotationItem[]>([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);

  // ---------- fetch quotations ----------
  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, pageSize };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res: any = await quotationsApi.list(params);
      const data: PaginatedData<Quotation> = res.data;
      setQuotations(data.items);
      setTotal(data.total);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, search]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  // ---------- fetch customers ----------
  useEffect(() => {
    customersApi
      .list({ pageSize: 1000 })
      .then((res: any) => setCustomers(res.data?.items ?? []))
      .catch(() => {});
  }, []);

  // ---------- helpers ----------
  const recalcItem = (item: QuotationItem) => ({
    ...item,
    totalPrice: Number((item.quantity * item.unitPrice).toFixed(2)),
  });

  const totalAmount = items.reduce((s, i) => s + i.totalPrice, 0);

  // ---------- item handlers ----------
  const updateItem = (index: number, field: keyof QuotationItem, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = recalcItem({ ...next[index], [field]: value });
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { ...emptyItem }]);

  const removeItem = (index: number) => {
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ---------- open modal ----------
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm });
    setItems([{ ...emptyItem }]);
    setModalOpen(true);
  };

  const openEdit = async (q: Quotation) => {
    setEditingId(q.id);
    setForm({
      customerId: q.customerId,
      title: q.title,
      currency: q.currency,
      validUntil: q.validUntil ? q.validUntil.slice(0, 10) : '',
      terms: q.terms ?? '',
      remark: q.remark ?? '',
    });
    setItems(
      q.items.length > 0
        ? q.items.map((i) => ({ ...i }))
        : [{ ...emptyItem }]
    );
    setModalOpen(true);
  };

  // ---------- submit ----------
  const handleSubmit = async () => {
    if (!form.customerId) {
      toast.error('请选择客户');
      return;
    }
    if (!form.title.trim()) {
      toast.error('请输入标题');
      return;
    }
    if (items.some((i) => !i.productName.trim())) {
      toast.error('请填写所有产品名称');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        validUntil: form.validUntil || undefined,
        totalAmount,
        items: items.map((i, idx) => ({
          productName: i.productName,
          description: i.description,
          unit: i.unit,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          totalPrice: Number(i.totalPrice),
          sortOrder: idx,
        })),
      };

      if (editingId) {
        await quotationsApi.update(editingId, payload);
        toast.success('报价单已更新');
      } else {
        await quotationsApi.create(payload);
        toast.success('报价单已创建');
      }
      setModalOpen(false);
      fetchQuotations();
    } catch {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- actions ----------
  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除此报价单吗？')) return;
    try {
      await quotationsApi.delete(id);
      toast.success('报价单已删除');
      fetchQuotations();
    } catch {}
  };

  const handleGeneratePdf = async (id: string) => {
    try {
      await quotationsApi.generatePdf(id);
      toast.success('PDF 已生成');
      fetchQuotations();
    } catch {}
  };

  const handleSendEmail = async (id: string) => {
    try {
      await quotationsApi.send(id);
      toast.success('报价单已发送');
      fetchQuotations();
    } catch {}
  };

  // ---------- render ----------
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">报价管理</h1>
          <button
            onClick={openCreate}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            新建报价
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">全部状态</option>
            {Object.entries(QUOTATION_STATUS_MAP).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜索报价编号或标题..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['报价编号', '标题', '客户', '金额', '货币', '状态', '有效期', '创建时间', '操作'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                      加载中...
                    </td>
                  </tr>
                ) : quotations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  quotations.map((q) => {
                    const status = QUOTATION_STATUS_MAP[q.status];
                    return (
                      <tr key={q.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                          {q.quotationNo}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {q.title}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {q.customer?.companyName ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {q.totalAmount.toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {q.currency}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <Badge className={status?.color}>{status?.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {q.validUntil ? q.validUntil.slice(0, 10) : '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          {q.createdAt?.slice(0, 10)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEdit(q)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              查看
                            </button>
                            <button
                              onClick={() => openEdit(q)}
                              className="text-indigo-600 hover:text-indigo-800"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleGeneratePdf(q.id)}
                              className="text-green-600 hover:text-green-800"
                            >
                              生成PDF
                            </button>
                            <button
                              onClick={() => handleSendEmail(q.id)}
                              className="text-purple-600 hover:text-purple-800"
                            >
                              发送邮件
                            </button>
                            <button
                              onClick={() => handleDelete(q.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pagination current={page} total={total} pageSize={pageSize} onChange={setPage} />
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '编辑报价单' : '新建报价单'}
        size="xl"
      >
        <div className="space-y-6">
          {/* Basic fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">客户 *</label>
              <select
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">请选择客户</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">标题 *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="报价单标题"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">货币</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">有效期</label>
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">条款</label>
            <textarea
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="付款条款、交货条款等"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
            <textarea
              value={form.remark}
              onChange={(e) => setForm({ ...form, remark: e.target.value })}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="备注信息"
            />
          </div>

          {/* Items table */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">报价明细</h4>
              <button
                type="button"
                onClick={addItem}
                className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
              >
                添加行
              </button>
            </div>
            <div className="overflow-x-auto rounded border">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      产品名称
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      描述
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      单位
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      数量
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      单价
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      小计
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.productName}
                          onChange={(e) => updateItem(idx, 'productName', e.target.value)}
                          className="w-full rounded border px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="产品名称"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.description ?? ''}
                          onChange={(e) => updateItem(idx, 'description', e.target.value)}
                          className="w-full rounded border px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="描述"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                          className="w-16 rounded border px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                          className="w-20 rounded border px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                          className="w-24 rounded border px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-800">
                        {item.totalPrice.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          disabled={items.length === 1}
                          className="text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right text-sm font-semibold text-gray-800">
              合计金额：{form.currency} {totalAmount.toLocaleString()}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
