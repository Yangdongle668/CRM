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
import type { BankAccount } from '@/types';

/**
 * BankAccountsPanel — admin UI for multi-bank management.
 *
 * Each row is one receiving account: a short `alias` (shown in the PI
 * dropdown) and a `bankInfoText` block that gets embedded verbatim into
 * the PI PDF. One account is marked `isDefault` and used when a PI does
 * not pick a specific account.
 */

interface BankForm {
  alias: string;
  bankInfoText: string;
  isDefault: boolean;
}

const EMPTY_FORM: BankForm = {
  alias: '',
  bankInfoText: '',
  isDefault: false,
};

const PLACEHOLDER = `Account number: 123456789
Account name: Company Name
SWIFT/BIC code: ABCDEFGH
Bank name: Bank of Example
Bank address: 123 Main St
Country/region: China
For the payment of goods, please make a USD Payment`;

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
      bankInfoText: account.bankInfoText || '',
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
    if (!form.bankInfoText.trim()) {
      toast.error('请填写银行信息');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        alias: form.alias.trim(),
        bankInfoText: form.bankInfoText,
        isDefault: form.isDefault,
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
    if (!confirm('确定要删除该银行账户吗？关联的 PI 不会被删除，只会清空银行选项。')) return;
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
          <span className="text-[12px] text-gray-400">· 可配置多个收款账户，给每个账户起个简称即可</span>
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
          <div className="space-y-3">
            {banks.map((b) => (
              <article
                key={b.id}
                className="group rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-primary-200 hover:shadow-apple"
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
                    </div>
                    <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-50/60 p-2.5 font-mono text-[11px] leading-5 text-gray-600">
                      {b.bankInfoText}
                    </pre>
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
        maxWidth="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-600">
              简称 <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-gray-400">（在 PI 下拉里展示）</span>
            </span>
            <input
              type="text"
              value={form.alias}
              onChange={(e) => setForm({ ...form, alias: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder="例如：招行 USD / BOC EUR / HSBC HKD"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-600">
              银行信息 <span className="text-red-500">*</span>
              <span className="ml-1 font-normal text-gray-400">（每行一条，将原样显示在 PI PDF 中）</span>
            </span>
            <textarea
              value={form.bankInfoText}
              onChange={(e) => setForm({ ...form, bankInfoText: e.target.value })}
              rows={10}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-[12px] leading-5 text-gray-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              placeholder={PLACEHOLDER}
            />
          </label>

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
