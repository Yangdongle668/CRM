'use client';

/**
 * PI PDF 导入订单向导：
 *   1. 选 PDF → 上传到 /orders/parse-pi 拿预览
 *   2. 字段编辑 + 客户匹配（自动建议或手选）
 *   3. 确认 → 走标准 ordersApi.create 落库
 *
 * 整个流程都在用户确认后才写库，PDF 解析永远是 best-effort：
 * 哪怕没解析全，用户也能在表单里手动补完。
 */

import React, { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDocumentArrowUp,
  HiOutlineXMark,
  HiOutlinePlus,
  HiOutlineTrash,
} from 'react-icons/hi2';
import Modal from '@/components/ui/Modal';
import { ordersApi, customersApi } from '@/lib/api';
import type { Customer } from '@/types';

interface ParsedItem {
  productName: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface ParsedPi {
  piNo: string | null;
  poNo: string | null;
  date: string | null;
  currency: string | null;
  consigneeName: string | null;
  consigneeAddress: string | null;
  shippingMethod: string | null;
  paymentTerm: string | null;
  notes: string | null;
  totalAmount: number | null;
  items: ParsedItem[];
}

interface CustomerSuggestion {
  id: string;
  companyName: string;
  score: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'HKD', 'AUD', 'CAD', 'SGD'];

export default function PiImportModal({ open, onClose, onCreated }: Props) {
  const [stage, setStage] = useState<'pick' | 'preview'>('pick');
  const [uploading, setUploading] = useState(false);
  const [parsed, setParsed] = useState<ParsedPi | null>(null);
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [form, setForm] = useState({
    title: '',
    currency: 'USD',
    totalAmount: 0,
    poNo: '',
    remark: '',
    shippingAddr: '',
  });
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage('pick');
    setParsed(null);
    setSuggestions([]);
    setCustomerId('');
    setCustomerSearch('');
    setCustomerOptions([]);
    setItems([]);
    setForm({ title: '', currency: 'USD', totalAmount: 0, poNo: '', remark: '', shippingAddr: '' });
    setUploading(false);
    setCreating(false);
  };

  const handleClose = () => {
    if (uploading || creating) return;
    reset();
    onClose();
  };

  const handlePickFile = async (file: File) => {
    if (!/\.pdf$/i.test(file.name)) {
      toast.error('只支持 PDF 文件');
      return;
    }
    setUploading(true);
    try {
      const res: any = await ordersApi.parsePi(file);
      const data = res?.data || res;
      const p: ParsedPi = data.parsed;
      setParsed(p);
      setSuggestions(Array.isArray(data.customerSuggestions) ? data.customerSuggestions : []);
      setItems(Array.isArray(p.items) ? p.items : []);
      // 自动选最高分的候选客户
      const top = (data.customerSuggestions || [])[0];
      if (top) setCustomerId(top.id);
      // 表单预填
      setForm({
        title: p.poNo
          ? `PI ${p.piNo || ''} - PO ${p.poNo}`
          : p.piNo
            ? `PI ${p.piNo}`
            : p.consigneeName
              ? `${p.consigneeName} 订单`
              : '导入的 PI 订单',
        currency: p.currency || 'USD',
        totalAmount: Number(p.totalAmount) || 0,
        poNo: p.poNo || '',
        remark: [
          p.piNo && `PI No: ${p.piNo}`,
          p.shippingMethod && `Shipping: ${p.shippingMethod}`,
          p.paymentTerm && `Payment: ${p.paymentTerm}`,
        ]
          .filter(Boolean)
          .join(' · '),
        shippingAddr: p.consigneeAddress || '',
      });
      setStage('preview');
    } catch (err: any) {
      // axios 拦截器会 toast；这里不重复
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /** 候选客户搜索：前面后端已经按 consignee 名做了第一轮建议，
   *  这里给用户一个手动搜索框作为兜底（候选名字命中不准时）。 */
  const handleSearchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCustomerOptions([]);
      return;
    }
    setSearching(true);
    try {
      const res: any = await customersApi.list({ search: q, pageSize: 10 });
      setCustomerOptions(res?.data?.items || res?.data || []);
    } catch {
      setCustomerOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // 简单防抖
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCustomerSearchChange = (v: string) => {
    setCustomerSearch(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => handleSearchCustomers(v), 200);
  };

  const updateItem = (idx: number, patch: Partial<ParsedItem>) => {
    setItems((prev) => {
      const next = [...prev];
      const cur = { ...next[idx], ...patch };
      // 自动算 totalPrice
      if (patch.quantity !== undefined || patch.unitPrice !== undefined) {
        cur.totalPrice = Number((cur.quantity * cur.unitPrice).toFixed(2));
      }
      next[idx] = cur;
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { productName: '', quantity: 1, unitPrice: 0, totalPrice: 0 }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const itemsSubtotal = items.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);

  const handleConfirm = async () => {
    if (!customerId) {
      toast.error('请先选择对应的客户');
      return;
    }
    if (!form.title.trim()) {
      toast.error('请填写订单标题');
      return;
    }
    if (items.length === 0) {
      toast.error('订单至少需要一条产品');
      return;
    }
    for (const it of items) {
      if (!it.productName.trim()) {
        toast.error('产品名不能为空');
        return;
      }
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        toast.error('数量必须 > 0');
        return;
      }
      if (!Number.isFinite(it.unitPrice) || it.unitPrice < 0) {
        toast.error('单价必须 ≥ 0');
        return;
      }
    }

    setCreating(true);
    try {
      await ordersApi.create({
        customerId,
        title: form.title.trim(),
        currency: form.currency,
        totalAmount: form.totalAmount > 0 ? form.totalAmount : itemsSubtotal,
        shippingAddr: form.shippingAddr || undefined,
        remark: form.remark || undefined,
        items: items.map((it, idx) => ({
          productName: it.productName.trim(),
          unit: it.unit || 'PCS',
          quantity: Math.max(1, Math.round(it.quantity)),
          unitPrice: Number(it.unitPrice),
          totalPrice: Number(it.totalPrice),
          sortOrder: idx,
        })),
      });
      toast.success('订单已创建');
      onCreated();
      handleClose();
    } catch {
      // axios 拦截器已 toast
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={stage === 'pick' ? '扫描 PI 导入订单' : '确认订单信息'}
      maxWidth="4xl"
      dismissible={false}
    >
      {stage === 'pick' ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            上传一份 Proforma Invoice 的 PDF 文件，系统会自动抽取客户、产品、数量、单价等关键信息，
            生成一个可编辑的订单草稿。<span className="text-gray-400">解析为最佳努力，请在下一步确认数据。</span>
          </p>
          <label
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-10 text-gray-500 transition-colors hover:border-blue-400 hover:bg-blue-50/40 ${
              uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'
            }`}
          >
            <HiOutlineDocumentArrowUp className="h-10 w-10 text-blue-500" />
            <div className="text-sm font-medium text-gray-800">
              {uploading ? '正在解析…' : '点击选择 PDF 文件'}
            </div>
            <div className="text-xs text-gray-400">.pdf · 最大 10 MB</div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePickFile(f);
              }}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* 客户匹配 */}
          <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="text-sm font-semibold text-gray-800">客户</div>
            {parsed?.consigneeName && (
              <div className="text-xs text-gray-600">
                PDF 上的收件方：<span className="font-medium text-gray-900">{parsed.consigneeName}</span>
              </div>
            )}
            {suggestions.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-gray-500">系统候选：</div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCustomerId(s.id)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        customerId === s.id
                          ? 'border-blue-500 bg-blue-500 text-white'
                          : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
                      }`}
                    >
                      {s.companyName}
                      <span className="ml-1 text-[10px] opacity-70">{s.score}%</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5 pt-1 sm:flex-row sm:items-center">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => onCustomerSearchChange(e.target.value)}
                placeholder="或手动搜索客户名…"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searching && <span className="text-xs text-gray-400">查询中…</span>}
            </div>
            {customerOptions.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                {customerOptions.map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerSearch(c.companyName);
                      setCustomerOptions([]);
                    }}
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                      customerId === c.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    {c.companyName}
                  </button>
                ))}
              </div>
            )}
            {!customerId && (
              <p className="text-xs text-amber-600">
                没找到合适的客户？请先到"客户管理"建一个，再回来导入。
              </p>
            )}
          </div>

          {/* 基本字段 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">订单标题 *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">币种</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">PO 号</label>
              <input
                type="text"
                value={form.poNo}
                onChange={(e) => setForm({ ...form, poNo: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">总金额</label>
              <input
                type="number"
                step="0.01"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: Number(e.target.value) })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-0.5 text-[11px] text-gray-400">
                明细合计：{itemsSubtotal.toFixed(2)} {form.currency}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">收货地址</label>
              <input
                type="text"
                value={form.shippingAddr}
                onChange={(e) => setForm({ ...form, shippingAddr: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">备注</label>
              <textarea
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 明细 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-800">产品明细</h3>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50"
              >
                <HiOutlinePlus className="h-3.5 w-3.5" />
                添加一行
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="px-2 py-2 text-left font-normal">产品名 *</th>
                    <th className="px-2 py-2 text-left font-normal w-20">单位</th>
                    <th className="px-2 py-2 text-right font-normal w-20">数量 *</th>
                    <th className="px-2 py-2 text-right font-normal w-28">单价 *</th>
                    <th className="px-2 py-2 text-right font-normal w-28">小计</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-gray-400">
                        没有解析到产品，请点"添加一行"手动输入。
                      </td>
                    </tr>
                  )}
                  {items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          value={it.productName}
                          onChange={(e) => updateItem(idx, { productName: e.target.value })}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="text"
                          value={it.unit || 'PCS'}
                          onChange={(e) => updateItem(idx, { unit: e.target.value })}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          type="number"
                          step="0.01"
                          value={it.unitPrice}
                          onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) })}
                          className="w-full rounded border border-gray-200 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-gray-700">
                        {(Number(it.totalPrice) || 0).toFixed(2)}
                      </td>
                      <td className="px-1 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="删除"
                        >
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* footer */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => {
                reset();
              }}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              <HiOutlineXMark className="mr-1 inline h-4 w-4" />
              重新选择 PDF
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={creating}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={creating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? '创建中…' : '确认创建订单'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
