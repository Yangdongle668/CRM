'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineCheckBadge,
  HiOutlineStar,
  HiOutlineDocumentDuplicate,
} from 'react-icons/hi2';
import { Modal } from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { bankAccountsApi, piTemplatesApi } from '@/lib/api';
import {
  CURRENCIES,
  TRADE_TERMS,
  PAYMENT_TERMS,
  SHIPPING_METHODS,
  PAYMENT_METHODS,
} from '@/lib/constants';
import type { BankAccount, PITemplate } from '@/types';

/**
 * PITemplatesPanel — admin UI for PI presets.
 *
 * A template stores "commonly used defaults" for one kind of PI (e.g.
 * "Sea FOB USD" vs "Air Sample DDP"). Salespeople pick one when creating a
 * PI and the fields auto-fill. Template fields are all optional — leave a
 * field empty to make the PI form stay blank for that field.
 */

interface TemplateForm {
  name: string;
  description: string;
  currency: string;
  tradeTerm: string;
  paymentTerm: string;
  shippingMethod: string;
  paymentMethod: string;
  portOfLoading: string;
  portOfDischarge: string;
  placeOfDelivery: string;
  countryOfOrigin: string;
  termsOfDelivery: string;
  notes: string;
  validityPeriod: string;
  bankAccountId: string;
  isDefault: boolean;
}

const EMPTY_FORM: TemplateForm = {
  name: '',
  description: '',
  currency: 'USD',
  tradeTerm: '',
  paymentTerm: '',
  shippingMethod: '',
  paymentMethod: '',
  portOfLoading: '',
  portOfDischarge: '',
  placeOfDelivery: '',
  countryOfOrigin: '',
  termsOfDelivery: '',
  notes: '',
  validityPeriod: '',
  bankAccountId: '',
  isDefault: false,
};

export default function PITemplatesPanel() {
  const [templates, setTemplates] = useState<PITemplate[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PITemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tplRes, bankRes] = await Promise.all([
        piTemplatesApi.list(),
        bankAccountsApi.list(),
      ]);
      setTemplates((tplRes as any).data || []);
      setBanks((bankRes as any).data || []);
    } catch {
      toast.error('加载模板失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, isDefault: templates.length === 0 });
    setModalOpen(true);
  };

  const openEdit = (tpl: PITemplate) => {
    setEditing(tpl);
    setForm({
      name: tpl.name,
      description: tpl.description || '',
      currency: tpl.currency || '',
      tradeTerm: tpl.tradeTerm || '',
      paymentTerm: tpl.paymentTerm || '',
      shippingMethod: tpl.shippingMethod || '',
      paymentMethod: tpl.paymentMethod || '',
      portOfLoading: tpl.portOfLoading || '',
      portOfDischarge: tpl.portOfDischarge || '',
      placeOfDelivery: tpl.placeOfDelivery || '',
      countryOfOrigin: tpl.countryOfOrigin || '',
      termsOfDelivery: tpl.termsOfDelivery || '',
      notes: tpl.notes || '',
      validityPeriod: tpl.validityPeriod ? String(tpl.validityPeriod) : '',
      bankAccountId: tpl.bankAccountId || '',
      isDefault: tpl.isDefault,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('请填写模板名称');
      return;
    }

    setSaving(true);
    try {
      // Empty strings to undefined so backend sees them as "not provided"
      // rather than storing literal "" — keeps the PI form cleaner.
      const toOptional = (v: string) => (v.trim() ? v.trim() : undefined);
      const payload = {
        name: form.name.trim(),
        description: toOptional(form.description),
        currency: toOptional(form.currency),
        tradeTerm: toOptional(form.tradeTerm),
        paymentTerm: toOptional(form.paymentTerm),
        shippingMethod: toOptional(form.shippingMethod),
        paymentMethod: toOptional(form.paymentMethod),
        portOfLoading: toOptional(form.portOfLoading),
        portOfDischarge: toOptional(form.portOfDischarge),
        placeOfDelivery: toOptional(form.placeOfDelivery),
        countryOfOrigin: toOptional(form.countryOfOrigin),
        termsOfDelivery: toOptional(form.termsOfDelivery),
        notes: toOptional(form.notes),
        validityPeriod: form.validityPeriod ? Number(form.validityPeriod) : undefined,
        bankAccountId: toOptional(form.bankAccountId),
        isDefault: form.isDefault,
      };
      if (editing) {
        await piTemplatesApi.update(editing.id, payload);
        toast.success('模板已更新');
      } else {
        await piTemplatesApi.create(payload);
        toast.success('模板已创建');
      }
      setModalOpen(false);
      fetchAll();
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该模板吗？关联的 PI 不受影响。')) return;
    try {
      await piTemplatesApi.delete(id);
      toast.success('已删除');
      fetchAll();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await piTemplatesApi.setDefault(id);
      toast.success('已设为默认模板');
      fetchAll();
    } catch {
      toast.error('设置失败');
    }
  };

  const getBankLabel = (id?: string | null) =>
    id ? banks.find((b) => b.id === id)?.alias || '已删除的账户' : '';

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white shadow-apple">
      <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <HiOutlineDocumentDuplicate className="h-4 w-4 text-gray-400" />
          <h3 className="text-[14px] font-semibold text-gray-900">PI 模板</h3>
          <span className="text-[12px] text-gray-400">· 预设常用字段，开单时一键套用</span>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-apple transition-colors hover:bg-primary-600"
        >
          <HiOutlinePlus className="h-3.5 w-3.5" />
          新建模板
        </button>
      </header>

      <div className="p-5">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-[13px] text-gray-400">
            加载中...
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-[13px] text-gray-500">
            还没有 PI 模板。模板可以预设贸易术语、付款方式、运输方式、银行账户等常用字段，
            业务员开 PI 时选一个就能自动填充。
          </div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <article
                key={t.id}
                className="group flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-all hover:border-primary-200 hover:shadow-apple"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-[14px] font-semibold text-gray-900">
                      {t.name}
                    </h4>
                    {t.isDefault && (
                      <Badge className="bg-amber-100 text-amber-700">默认</Badge>
                    )}
                  </div>
                  {t.description && (
                    <p className="mt-0.5 truncate text-[12px] text-gray-500">
                      {t.description}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                    {t.tradeTerm && (
                      <Tag>术语: {t.tradeTerm}</Tag>
                    )}
                    {t.paymentMethod && <Tag>付款: {t.paymentMethod}</Tag>}
                    {t.shippingMethod && <Tag>运输: {t.shippingMethod}</Tag>}
                    {t.currency && <Tag>币种: {t.currency}</Tag>}
                    {t.bankAccountId && <Tag>银行: {getBankLabel(t.bankAccountId)}</Tag>}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {!t.isDefault && (
                    <button
                      onClick={() => handleSetDefault(t.id)}
                      title="设为默认"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                    >
                      <HiOutlineStar className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(t)}
                    title="编辑"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    title="删除"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <HiOutlineTrash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑 PI 模板' : '新建 PI 模板'}
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <TplField label="模板名称" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={fieldInputCls}
                placeholder="海运 CIF 模板"
              />
            </TplField>
            <TplField label="描述">
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={fieldInputCls}
                placeholder="例如：美国客户 CIF LA 默认模板"
              />
            </TplField>
            <TplField label="默认币种">
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className={fieldInputCls + ' cursor-pointer'}
              >
                <option value="">—</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </TplField>
            <TplField label="有效期（天）">
              <input
                type="number"
                min={1}
                value={form.validityPeriod}
                onChange={(e) => setForm({ ...form, validityPeriod: e.target.value })}
                className={fieldInputCls}
              />
            </TplField>
            <TplField label="贸易术语">
              <select
                value={form.tradeTerm}
                onChange={(e) => setForm({ ...form, tradeTerm: e.target.value })}
                className={fieldInputCls + ' cursor-pointer'}
              >
                <option value="">—</option>
                {TRADE_TERMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} — {t.desc}
                  </option>
                ))}
              </select>
            </TplField>
            <TplField label="付款条款">
              <select
                value={form.paymentTerm}
                onChange={(e) => setForm({ ...form, paymentTerm: e.target.value })}
                className={fieldInputCls + ' cursor-pointer'}
              >
                <option value="">—</option>
                {PAYMENT_TERMS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </TplField>
            <TplField label="运输方式">
              <select
                value={form.shippingMethod}
                onChange={(e) => setForm({ ...form, shippingMethod: e.target.value })}
                className={fieldInputCls + ' cursor-pointer'}
              >
                <option value="">—</option>
                {SHIPPING_METHODS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </TplField>
            <TplField label="付款方式">
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                className={fieldInputCls + ' cursor-pointer'}
              >
                <option value="">—</option>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </TplField>
            <TplField label="默认收款银行">
              <select
                value={form.bankAccountId}
                onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}
                className={fieldInputCls + ' cursor-pointer'}
              >
                <option value="">—</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.alias}
                    {b.currency ? ` · ${b.currency}` : ''}
                  </option>
                ))}
              </select>
            </TplField>
            <TplField label="原产国">
              <input
                type="text"
                value={form.countryOfOrigin}
                onChange={(e) => setForm({ ...form, countryOfOrigin: e.target.value })}
                className={fieldInputCls}
                placeholder="China"
              />
            </TplField>
            <TplField label="装货港口">
              <input
                type="text"
                value={form.portOfLoading}
                onChange={(e) => setForm({ ...form, portOfLoading: e.target.value })}
                className={fieldInputCls}
                placeholder="Shanghai, China"
              />
            </TplField>
            <TplField label="卸货港口">
              <input
                type="text"
                value={form.portOfDischarge}
                onChange={(e) => setForm({ ...form, portOfDischarge: e.target.value })}
                className={fieldInputCls}
              />
            </TplField>
            <div className="col-span-2">
              <TplField label="交货地点">
                <input
                  type="text"
                  value={form.placeOfDelivery}
                  onChange={(e) => setForm({ ...form, placeOfDelivery: e.target.value })}
                  className={fieldInputCls}
                />
              </TplField>
            </div>
            <div className="col-span-2">
              <TplField label="交货条款 (Terms of Delivery)">
                <input
                  type="text"
                  value={form.termsOfDelivery}
                  onChange={(e) => setForm({ ...form, termsOfDelivery: e.target.value })}
                  className={fieldInputCls}
                  placeholder="Only after full payment is received"
                />
              </TplField>
            </div>
            <div className="col-span-2">
              <TplField label="默认备注">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className={fieldInputCls + ' resize-none'}
                />
              </TplField>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-gray-700">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            设为默认模板（新建 PI 时自动套用）
          </label>

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              <HiOutlineCheckBadge className="h-4 w-4" />
              {saving ? '保存中...' : editing ? '保存修改' : '创建模板'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

const fieldInputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

function TplField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
      {children}
    </span>
  );
}
