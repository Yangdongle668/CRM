'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineCheckBadge,
  HiOutlineStar,
  HiOutlineBanknotes,
} from 'react-icons/hi2';
import { Modal } from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { bankAccountsApi } from '@/lib/api';
import { CURRENCIES } from '@/lib/constants';
import type { BankAccount } from '@/types';

/**
 * BankAccountsPanel — admin UI for multi-bank management.
 *
 * Each row represents one receiving account that a PI can reference.
 * The `alias` field is the short name shown in the PI dropdown — it's the
 * one required field. Everything else is optional and simply fills the
 * "Bank Information" block on the generated PDF when present.
 *
 * A single account is marked `isDefault`; PIs that don't pick an account
 * fall back to the default. Setting one as default automatically unsets
 * any previous default (handled server-side).
 */

interface BankForm {
  alias: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  bankAddress: string;
  swiftCode: string;
  currency: string;
  country: string;
  branchName: string;
  routingNumber: string;
  iban: string;
  paymentMemo: string;
  extraInfo: string;
  isDefault: boolean;
}

const EMPTY_FORM: BankForm = {
  alias: '',
  accountName: '',
  accountNumber: '',
  bankName: '',
  bankAddress: '',
  swiftCode: '',
  currency: 'USD',
  country: '',
  branchName: '',
  routingNumber: '',
  iban: '',
  paymentMemo: '',
  extraInfo: '',
  isDefault: false,
};

export default function BankAccountsPanel() {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<BankForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await bankAccountsApi.list();
      setBanks(res.data || []);
    } catch {
      toast.error('加载银行账户失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, isDefault: banks.length === 0 });
    setModalOpen(true);
  };

  const openEdit = (account: BankAccount) => {
    setEditing(account);
    setForm({
      alias: account.alias || '',
      accountName: account.accountName || '',
      accountNumber: account.accountNumber || '',
      bankName: account.bankName || '',
      bankAddress: account.bankAddress || '',
      swiftCode: account.swiftCode || '',
      currency: account.currency || 'USD',
      country: account.country || '',
      branchName: account.branchName || '',
      routingNumber: account.routingNumber || '',
      iban: account.iban || '',
      paymentMemo: account.paymentMemo || '',
      extraInfo: account.extraInfo || '',
      isDefault: account.isDefault,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.alias.trim()) {
      toast.error('请填写银行简称');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        alias: form.alias.trim(),
      };
      if (editing) {
        await bankAccountsApi.update(editing.id, payload);
        toast.success('银行账户已更新');
      } else {
        await bankAccountsApi.create(payload);
        toast.success('银行账户已创建');
      }
      setModalOpen(false);
      fetchBanks();
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除该银行账户吗？关联的 PI 会保留但银行信息清空。')) return;
    setDeletingId(id);
    try {
      await bankAccountsApi.delete(id);
      toast.success('已删除');
      fetchBanks();
    } catch {
      toast.error('删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await bankAccountsApi.setDefault(id);
      toast.success('已设为默认账户');
      fetchBanks();
    } catch {
      toast.error('设置失败');
    }
  };

  return (
    <section className="rounded-2xl border border-gray-200/80 bg-white shadow-apple">
      <header className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <HiOutlineBanknotes className="h-4 w-4 text-gray-400" />
          <h3 className="text-[14px] font-semibold text-gray-900">银行账户</h3>
          <span className="text-[12px] text-gray-400">· 可配置多个收款账户并在 PI 中选择</span>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-500 px-3 py-1.5 text-[12px] font-medium text-white shadow-apple transition-colors hover:bg-primary-600"
        >
          <HiOutlinePlus className="h-3.5 w-3.5" />
          新建账户
        </button>
      </header>

      <div className="p-5">
        {loading ? (
          <div className="flex h-24 items-center justify-center text-[13px] text-gray-400">
            加载中...
          </div>
        ) : banks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-[13px] text-gray-500">
            还没有银行账户。点击右上角「新建账户」添加第一个收款账户。
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {banks.map((b) => (
              <article
                key={b.id}
                className="group relative rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-primary-200 hover:shadow-apple"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="truncate text-[14px] font-semibold text-gray-900">
                        {b.alias}
                      </h4>
                      {b.isDefault && (
                        <Badge className="bg-amber-100 text-amber-700">默认</Badge>
                      )}
                      {b.currency && (
                        <Badge className="bg-primary-50 text-primary-700">{b.currency}</Badge>
                      )}
                    </div>
                    {b.bankName && (
                      <p className="mt-1 truncate text-[12px] text-gray-500">{b.bankName}</p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {!b.isDefault && (
                      <button
                        onClick={() => handleSetDefault(b.id)}
                        title="设为默认"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-amber-50 hover:text-amber-600"
                      >
                        <HiOutlineStar className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(b)}
                      title="编辑"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(b.id)}
                      disabled={deletingId === b.id}
                      title="删除"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <HiOutlineTrash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <dl className="mt-3 space-y-1 text-[12px] text-gray-500">
                  {b.accountNumber && (
                    <div className="flex gap-2">
                      <dt className="w-16 flex-shrink-0 text-gray-400">账号</dt>
                      <dd className="truncate font-mono">{b.accountNumber}</dd>
                    </div>
                  )}
                  {b.swiftCode && (
                    <div className="flex gap-2">
                      <dt className="w-16 flex-shrink-0 text-gray-400">SWIFT</dt>
                      <dd className="truncate font-mono">{b.swiftCode}</dd>
                    </div>
                  )}
                </dl>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? '编辑银行账户' : '新建银行账户'}
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <BankField label="简称 (Alias)" required hint="下拉里展示，如：招行 USD">
              <input
                type="text"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                className={fieldInputCls}
                placeholder="招行 USD / BOC EUR"
              />
            </BankField>
            <BankField label="币种">
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
            </BankField>
            <BankField label="户名 (Account name)">
              <input
                type="text"
                value={form.accountName}
                onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                className={fieldInputCls}
              />
            </BankField>
            <BankField label="账号 (Account number)">
              <input
                type="text"
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                className={fieldInputCls}
              />
            </BankField>
            <BankField label="开户行 (Bank name)">
              <input
                type="text"
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                className={fieldInputCls}
              />
            </BankField>
            <BankField label="SWIFT/BIC">
              <input
                type="text"
                value={form.swiftCode}
                onChange={(e) => setForm({ ...form, swiftCode: e.target.value })}
                className={fieldInputCls}
                placeholder="ABCDEFGH"
              />
            </BankField>
            <BankField label="IBAN">
              <input
                type="text"
                value={form.iban}
                onChange={(e) => setForm({ ...form, iban: e.target.value })}
                className={fieldInputCls}
              />
            </BankField>
            <BankField label="Routing / ABA">
              <input
                type="text"
                value={form.routingNumber}
                onChange={(e) => setForm({ ...form, routingNumber: e.target.value })}
                className={fieldInputCls}
              />
            </BankField>
            <BankField label="分支机构 (Branch)">
              <input
                type="text"
                value={form.branchName}
                onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                className={fieldInputCls}
              />
            </BankField>
            <BankField label="国家/地区">
              <input
                type="text"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className={fieldInputCls}
                placeholder="China"
              />
            </BankField>
            <div className="col-span-2">
              <BankField label="银行地址 (Bank address)">
                <textarea
                  value={form.bankAddress}
                  onChange={(e) => setForm({ ...form, bankAddress: e.target.value })}
                  rows={2}
                  className={fieldInputCls + ' resize-none'}
                />
              </BankField>
            </div>
            <div className="col-span-2">
              <BankField label="支付备注" hint="PDF 中附加的一行文字">
                <input
                  type="text"
                  value={form.paymentMemo}
                  onChange={(e) => setForm({ ...form, paymentMemo: e.target.value })}
                  className={fieldInputCls}
                  placeholder="For the payment of goods, please make a USD Payment"
                />
              </BankField>
            </div>
            <div className="col-span-2">
              <BankField label="其他信息" hint="每行一条，会附加在 PDF 银行信息块末尾">
                <textarea
                  value={form.extraInfo}
                  onChange={(e) => setForm({ ...form, extraInfo: e.target.value })}
                  rows={3}
                  className={fieldInputCls + ' resize-none font-mono text-[12px]'}
                />
              </BankField>
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] text-gray-700">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
            />
            设为默认账户（PI 未指定账户时使用）
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
              {saving ? '保存中...' : editing ? '保存修改' : '创建账户'}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

const fieldInputCls =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

function BankField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </label>
  );
}
