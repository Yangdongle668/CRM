'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import Pagination from '@/components/ui/Pagination';
import { ordersApi, customersApi, documentsApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { ORDER_STATUS_MAP, PAYMENT_STATUS_MAP, CURRENCIES } from '@/lib/constants';
import toast from 'react-hot-toast';
import type {
  Order,
  OrderItem,
  OrderStatus,
  PaymentStatus,
  Customer,
  PaginatedData,
  Document,
} from '@/types';

const emptyItem: OrderItem = {
  productName: '',
  description: '',
  unit: '个',
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0,
};

const COST_TYPE_OPTIONS = ['模具', '认证', '货物', '设备', 'NRE费用'] as const;

const defaultForm = {
  customerId: '',
  title: '',
  currency: 'USD',
  costTypes: [] as string[],
  floorPrice: '',
  shippingAddr: '',
  shippingDate: '',
  trackingNo: '',
  remark: '',
};

export default function OrdersPage() {
  const { user } = useAuth();
  const isFinance = user?.role === 'FINANCE';

  // ---------- list state ----------
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(false);

  // ---------- filters ----------
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [paymentFilter, setPaymentFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  // ---------- customers ----------
  const [customers, setCustomers] = useState<Customer[]>([]);

  // ---------- create/edit modal ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [items, setItems] = useState<OrderItem[]>([{ ...emptyItem }]);
  const [submitting, setSubmitting] = useState(false);

  // ---------- detail modal ----------
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  // ---------- attachments ----------
  const [attachments, setAttachments] = useState<Document[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // ---------- fetch orders ----------
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, pageSize };
      if (statusFilter) params.status = statusFilter;
      if (paymentFilter) params.paymentStatus = paymentFilter;
      if (search) params.search = search;
      const res: any = await ordersApi.list(params);
      const data: PaginatedData<Order> = res.data;
      setOrders(data.items);
      setTotal(data.total);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, paymentFilter, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ---------- fetch customers ----------
  useEffect(() => {
    customersApi
      .list({ pageSize: 1000 })
      .then((res: any) => setCustomers(res.data?.items ?? []))
      .catch(() => {});
  }, []);

  // ---------- item helpers ----------
  const recalcItem = (item: OrderItem) => ({
    ...item,
    totalPrice: Number((item.quantity * item.unitPrice).toFixed(2)),
  });

  const totalAmount = items.reduce((s, i) => s + i.totalPrice, 0);

  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
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

  // ---------- open create modal ----------
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...defaultForm });
    setItems([{ ...emptyItem }]);
    setModalOpen(true);
  };

  // ---------- open edit modal ----------
  const openEdit = async (o: Order) => {
    try {
      const res: any = await ordersApi.getById(o.id);
      const full: Order = res.data;
      setEditingId(full.id);
      setForm({
        customerId: full.customerId,
        title: full.title,
        currency: full.currency,
        costTypes: full.costTypes ?? [],
        floorPrice: full.floorPrice != null ? String(full.floorPrice) : '',
        shippingAddr: full.shippingAddr ?? '',
        shippingDate: full.shippingDate ? full.shippingDate.slice(0, 10) : '',
        trackingNo: full.trackingNo ?? '',
        remark: full.remark ?? '',
      });
      setItems(
        full.items?.length > 0
          ? full.items.map((i) => ({ ...i }))
          : [{ ...emptyItem }]
      );
      setModalOpen(true);
    } catch {
      // error handled by interceptor
    }
  };

  // ---------- open detail ----------
  const openDetail = async (o: Order) => {
    try {
      const res: any = await ordersApi.getById(o.id);
      setDetailOrder(res.data);
    } catch {
      setDetailOrder(o);
    }
    // Fetch attachments for this order
    try {
      const docRes: any = await documentsApi.list({
        relatedType: 'Order',
        relatedId: o.id,
      });
      setAttachments(Array.isArray(docRes.data?.items) ? docRes.data.items : []);
    } catch {
      setAttachments([]);
    }
    setSelectedFile(null);
    setDetailOpen(true);
  };

  // ---------- submit create/edit ----------
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
      if (editingId) {
        // Only send fields that UpdateOrderDto accepts — no customerId or totalAmount
        const updatePayload = {
          title: form.title,
          currency: form.currency,
          costTypes: form.costTypes,
          floorPrice: form.floorPrice !== '' ? Number(form.floorPrice) : undefined,
          shippingAddr: form.shippingAddr || undefined,
          shippingDate: form.shippingDate || undefined,
          trackingNo: form.trackingNo || undefined,
          remark: form.remark || undefined,
          items: items.map((i, idx) => ({
            productName: i.productName,
            description: i.description || undefined,
            unit: i.unit,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
            sortOrder: idx,
          })),
        };
        await ordersApi.update(editingId, updatePayload);
        toast.success('订单已更新');
      } else {
        const createPayload = {
          customerId: form.customerId,
          title: form.title,
          currency: form.currency,
          costTypes: form.costTypes,
          floorPrice: form.floorPrice !== '' ? Number(form.floorPrice) : undefined,
          shippingAddr: form.shippingAddr || undefined,
          shippingDate: form.shippingDate || undefined,
          trackingNo: form.trackingNo || undefined,
          remark: form.remark || undefined,
          totalAmount,
          items: items.map((i, idx) => ({
            productName: i.productName,
            description: i.description || undefined,
            unit: i.unit,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            totalPrice: Number(i.totalPrice),
            sortOrder: idx,
          })),
        };
        await ordersApi.create(createPayload);
        toast.success('订单已创建');
      }
      setModalOpen(false);
      fetchOrders();
    } catch {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- status / payment updates ----------
  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await ordersApi.updateStatus(id, status);
      toast.success('订单状态已更新');
      fetchOrders();
      // refresh detail if open
      if (detailOrder?.id === id) {
        const res: any = await ordersApi.getById(id);
        setDetailOrder(res.data);
      }
    } catch {}
  };

  const handleUpdatePayment = async (id: string, paymentStatus: string) => {
    try {
      await ordersApi.updatePayment(id, paymentStatus);
      toast.success('付款状态已更新');
      fetchOrders();
      if (detailOrder?.id === id) {
        const res: any = await ordersApi.getById(id);
        setDetailOrder(res.data);
      }
    } catch {}
  };

  // ---------- delete ----------
  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除此订单吗？')) return;
    try {
      await ordersApi.delete(id);
      toast.success('订单已删除');
      fetchOrders();
    } catch {}
  };

  // ---------- attachments ----------
  const handleUploadAttachment = async () => {
    if (!selectedFile || !detailOrder) return;
    setUploadingAttachment(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('relatedType', 'Order');
      formData.append('relatedId', detailOrder.id);
      formData.append('category', '订单附件');

      await documentsApi.upload(formData);
      toast.success('附件上传成功');
      setSelectedFile(null);

      // Refresh attachments list
      const docRes: any = await documentsApi.list({
        relatedType: 'Order',
        relatedId: detailOrder.id,
      });
      setAttachments(Array.isArray(docRes.data?.items) ? docRes.data.items : []);
    } catch (err) {
      toast.error('附件上传失败');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDownloadAttachment = async (doc: Document) => {
    try {
      const blob: any = await documentsApi.download(doc.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('下载失败');
    }
  };

  const handleDeleteAttachment = async (docId: string) => {
    if (!window.confirm('确定要删除此附件吗？')) return;
    try {
      await documentsApi.delete(docId);
      toast.success('附件已删除');
      setAttachments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      toast.error('删除失败');
    }
  };

  // ---------- render ----------
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">订单管理</h1>
          {!isFinance && (
            <button
              onClick={openCreate}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              新建订单
            </button>
          )}
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
            <option value="">全部订单状态</option>
            {Object.entries(ORDER_STATUS_MAP).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => {
              setPaymentFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">全部付款状态</option>
            {Object.entries(PAYMENT_STATUS_MAP).map(([key, val]) => (
              <option key={key} value={key}>
                {val.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜索订单编号或标题..."
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
                  {[
                    '订单编号',
                    '标题',
                    '客户',
                    '金额',
                    '订单状态',
                    '付款状态',
                    '发货日期',
                    '创建时间',
                    '操作',
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                      加载中...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const os = ORDER_STATUS_MAP[o.status];
                    const ps = PAYMENT_STATUS_MAP[o.paymentStatus];
                    return (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                          {o.orderNo}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {o.title}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {o.customer?.companyName ?? '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {o.currency} {(o.totalAmount ?? 0).toLocaleString()}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <Badge className={os?.color}>{os?.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <Badge className={ps?.color}>{ps?.label}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                          {o.shippingDate ? o.shippingDate.slice(0, 10) : '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          {o.createdAt?.slice(0, 10)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openDetail(o)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              查看
                            </button>
                            {!isFinance && (
                              <>
                                <button
                                  onClick={() => openEdit(o)}
                                  className="text-indigo-600 hover:text-indigo-800"
                                >
                                  编辑
                                </button>
                                <button
                                  onClick={() => handleDelete(o.id)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  删除
                                </button>
                              </>
                            )}
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
        title={editingId ? '编辑订单' : '新建订单'}
        size="xl"
        dismissible={false}
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
                placeholder="订单标题"
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
              <label className="mb-1 block text-sm font-medium text-gray-700">公司底价</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                  {form.currency}
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.floorPrice}
                  onChange={(e) => setForm({ ...form, floorPrice: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 pl-12 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">发货日期</label>
              <input
                type="date"
                value={form.shippingDate}
                onChange={(e) => setForm({ ...form, shippingDate: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-2 block text-sm font-medium text-gray-700">费用类型</label>
              <div className="flex items-center gap-5">
                {COST_TYPE_OPTIONS.map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.costTypes.includes(opt)}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          costTypes: e.target.checked
                            ? [...prev.costTypes, opt]
                            : prev.costTypes.filter((t) => t !== opt),
                        }));
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">发货地址</label>
              <input
                type="text"
                value={form.shippingAddr}
                onChange={(e) => setForm({ ...form, shippingAddr: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="发货地址"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">物流单号</label>
              <input
                type="text"
                value={form.trackingNo}
                onChange={(e) => setForm({ ...form, trackingNo: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="物流追踪号"
              />
            </div>
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
              <h4 className="text-sm font-semibold text-gray-800">订单明细</h4>
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
                        {(item.totalPrice ?? 0).toLocaleString()}
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

      {/* Detail Modal */}
      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="订单详情"
        size="xl"
      >
        {detailOrder && (
          <div className="space-y-6">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-500">订单编号：</span>
                <span className="text-gray-900">{detailOrder.orderNo}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">标题：</span>
                <span className="text-gray-900">{detailOrder.title}</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">客户：</span>
                <span className="text-gray-900">
                  {detailOrder.customer?.companyName ?? '-'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">金额：</span>
                <span className="text-gray-900">
                  {detailOrder.currency} {(detailOrder.totalAmount ?? 0).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">公司底价：</span>
                <span className="text-gray-900">
                  {detailOrder.floorPrice != null
                    ? `${detailOrder.currency} ${Number(detailOrder.floorPrice).toLocaleString()}`
                    : '-'}
                </span>
              </div>
              {detailOrder.costTypes?.length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-500">费用类型：</span>
                  <span className="text-gray-900">{detailOrder.costTypes.join('、')}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-500">订单状态：</span>
                <Badge className={ORDER_STATUS_MAP[detailOrder.status]?.color}>
                  {ORDER_STATUS_MAP[detailOrder.status]?.label}
                </Badge>
              </div>
              <div>
                <span className="font-medium text-gray-500">付款状态：</span>
                <Badge className={PAYMENT_STATUS_MAP[detailOrder.paymentStatus]?.color}>
                  {PAYMENT_STATUS_MAP[detailOrder.paymentStatus]?.label}
                </Badge>
              </div>
              <div>
                <span className="font-medium text-gray-500">发货日期：</span>
                <span className="text-gray-900">
                  {detailOrder.shippingDate ? detailOrder.shippingDate.slice(0, 10) : '-'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">交付日期：</span>
                <span className="text-gray-900">
                  {detailOrder.deliveryDate ? detailOrder.deliveryDate.slice(0, 10) : '-'}
                </span>
              </div>
              {detailOrder.shippingAddr && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-500">发货地址：</span>
                  <span className="text-gray-900">{detailOrder.shippingAddr}</span>
                </div>
              )}
              {detailOrder.trackingNo && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-500">物流单号：</span>
                  <span className="text-gray-900">{detailOrder.trackingNo}</span>
                </div>
              )}
              {detailOrder.remark && (
                <div className="col-span-2">
                  <span className="font-medium text-gray-500">备注：</span>
                  <span className="text-gray-900">{detailOrder.remark}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-500">创建时间：</span>
                <span className="text-gray-900">{detailOrder.createdAt?.slice(0, 10)}</span>
              </div>
            </div>

            {/* Items list */}
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-800">订单明细</h4>
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
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                        数量
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                        单价
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                        小计
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {detailOrder.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-gray-900">{item.productName}</td>
                        <td className="px-3 py-2 text-gray-600">{item.description || '-'}</td>
                        <td className="px-3 py-2 text-gray-600">{item.unit}</td>
                        <td className="px-3 py-2 text-right text-gray-900">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-gray-900">
                          {(item.unitPrice ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {(item.totalPrice ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Attachments section */}
            <div className="border-t pt-4">
              <h4 className="mb-3 text-sm font-semibold text-gray-800">订单附件</h4>

              {/* Upload area — hidden for FINANCE */}
              {!isFinance && (
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
                    accept="*/*"
                  />
                  <button
                    onClick={handleUploadAttachment}
                    disabled={!selectedFile || uploadingAttachment}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {uploadingAttachment ? '上传中...' : '上传'}
                  </button>
                </div>
              )}

              {/* Attachments list */}
              {attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.fileName}</p>
                        <p className="text-xs text-gray-500">
                          {(doc.fileSize / 1024).toFixed(2)} KB · {doc.createdAt?.slice(0, 10)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <button
                          onClick={() => handleDownloadAttachment(doc)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          下载
                        </button>
                        {!isFinance && (
                          <button
                            onClick={() => handleDeleteAttachment(doc.id)}
                            className="text-xs text-red-600 hover:text-red-800 underline"
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">暂无附件</p>
              )}
            </div>

            {/* Status update buttons — hidden for FINANCE */}
            {!isFinance && (
              <>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">更新订单状态</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(ORDER_STATUS_MAP).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => handleUpdateStatus(detailOrder.id, key)}
                        disabled={detailOrder.status === key}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          detailOrder.status === key
                            ? 'cursor-default bg-gray-200 text-gray-500'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">更新付款状态</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(PAYMENT_STATUS_MAP).map(([key, val]) => (
                      <button
                        key={key}
                        onClick={() => handleUpdatePayment(detailOrder.id, key)}
                        disabled={detailOrder.paymentStatus === key}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                          detailOrder.paymentStatus === key
                            ? 'cursor-default bg-gray-200 text-gray-500'
                            : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {val.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end border-t pt-4">
              <button
                onClick={() => setDetailOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
