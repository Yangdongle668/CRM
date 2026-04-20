'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { holidaysApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { Holiday, HolidayType } from '@/types';
import {
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineArrowUpTray,
} from 'react-icons/hi2';

interface FormState {
  date: string;
  name: string;
  nameEn: string;
  type: HolidayType;
  isOff: boolean;
  lunar: boolean;
  note: string;
}

const EMPTY_FORM: FormState = {
  date: '',
  name: '',
  nameEn: '',
  type: 'CN',
  isOff: false,
  lunar: false,
  note: '',
};

const TYPE_LABEL: Record<HolidayType, string> = {
  CN: '法定节假日',
  CN_TRAD: '传统节日',
  INTL: '国际/美国',
  EU: '欧洲',
  IN: '印度',
  OBS: '休假高峰',
};

const TYPE_STYLE: Record<HolidayType, string> = {
  CN: 'bg-red-50 text-red-600 border-red-100',
  CN_TRAD: 'bg-amber-50 text-amber-700 border-amber-100',
  INTL: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  EU: 'bg-sky-50 text-sky-600 border-sky-100',
  IN: 'bg-orange-50 text-orange-600 border-orange-100',
  OBS: 'bg-purple-50 text-purple-600 border-purple-100',
};

export default function AdminHolidaysPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error('无权访问');
      router.replace('/dashboard');
    }
  }, [authLoading, isAdmin, router]);

  const fetchHolidays = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const res: any = await holidaysApi.list({ year });
      const data = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
      setHolidays(data);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [isAdmin, year]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  // Group by month for compact display
  const grouped = useMemo(() => {
    const map = new Map<number, Holiday[]>();
    for (const h of holidays) {
      const month = parseInt(h.date.slice(5, 7), 10);
      const arr = map.get(month) ?? [];
      arr.push(h);
      map.set(month, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [holidays]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, date: `${year}-01-01` });
    setModalOpen(true);
  };

  const openEdit = (h: Holiday) => {
    setEditingId(h.id);
    setForm({
      date: h.date.slice(0, 10),
      name: h.name,
      nameEn: h.nameEn ?? '',
      type: h.type,
      isOff: h.isOff,
      lunar: h.lunar,
      note: h.note ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.date || !form.name.trim()) {
      toast.error('日期和名称必填');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        date: form.date,
        name: form.name.trim(),
        nameEn: form.nameEn.trim() || undefined,
        type: form.type,
        isOff: form.isOff,
        lunar: form.lunar,
        note: form.note.trim() || undefined,
      };
      if (editingId) {
        await holidaysApi.update(editingId, payload);
        toast.success('已更新');
      } else {
        await holidaysApi.create(payload);
        toast.success('已创建');
      }
      setModalOpen(false);
      fetchHolidays();
    } catch {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (h: Holiday) => {
    if (!confirm(`确定要删除「${h.name}」（${h.date.slice(0, 10)}）？`)) return;
    try {
      await holidaysApi.delete(h.id);
      toast.success('已删除');
      fetchHolidays();
    } catch {
      // handled by interceptor
    }
  };

  const handleBulkImport = async () => {
    const lines = importText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    if (lines.length === 0) {
      toast.error('没有可导入的数据');
      return;
    }
    const items: any[] = [];
    const errors: string[] = [];
    lines.forEach((line, i) => {
      // Format: YYYY-MM-DD | name | type(CN|CN_TRAD|INTL) | isOff(0|1) | nameEn | note
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 2) {
        errors.push(`第 ${i + 1} 行格式错误`);
        return;
      }
      const [date, name, type = 'CN', isOff = '0', nameEn, note] = parts;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`第 ${i + 1} 行日期无效：${date}`);
        return;
      }
      if (!['CN', 'CN_TRAD', 'INTL', 'EU', 'IN', 'OBS'].includes(type)) {
        errors.push(`第 ${i + 1} 行类型无效：${type}`);
        return;
      }
      items.push({
        date,
        name,
        type,
        isOff: isOff === '1' || isOff.toLowerCase() === 'true',
        nameEn: nameEn || undefined,
        note: note || undefined,
      });
    });
    if (errors.length > 0) {
      toast.error(errors.slice(0, 3).join('\n'));
      return;
    }
    if (!confirm(`将用这 ${items.length} 条数据替换 ${year} 年全部节假日，确定？`)) return;
    setImporting(true);
    try {
      await holidaysApi.bulkUpsert(year, items);
      toast.success(`已导入 ${items.length} 条`);
      setImportOpen(false);
      setImportText('');
      fetchHolidays();
    } catch {
      // handled by interceptor
    } finally {
      setImporting(false);
    }
  };

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = now - 2; y <= now + 5; y++) arr.push(y);
    return arr;
  }, []);

  if (authLoading || !isAdmin) {
    return (
      <AppLayout>
        <div className="py-20 text-center text-gray-500">加载中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">节假日管理</h1>
            <p className="mt-1 text-sm text-gray-500">
              管理备忘录日历上显示的国内法定节假日、传统节日和国际节日，每年初更新最新数据
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <HiOutlineArrowUpTray className="h-4 w-4" />
              批量导入
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600"
            >
              <HiOutlinePlus className="h-4 w-4" />
              新增节日
            </button>
          </div>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">年份</span>
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-0.5">
            {yearOptions.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  y === year ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-400">共 {holidays.length} 条</span>
        </div>

        {/* Table grouped by month */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="py-20 text-center text-gray-400">加载中...</div>
          ) : grouped.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <p>{year} 年暂无节假日数据</p>
              <button
                onClick={openCreate}
                className="mt-2 text-sm text-primary-500 hover:text-primary-600"
              >
                立即添加
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {grouped.map(([month, items]) => (
                <div key={month}>
                  <div className="sticky top-0 z-10 bg-gray-50/90 px-5 py-2 text-xs font-semibold uppercase text-gray-500 backdrop-blur">
                    {month} 月 · {items.length} 项
                  </div>
                  <table className="min-w-full">
                    <tbody className="text-sm">
                      {items.map((h) => (
                        <tr key={h.id} className="hover:bg-gray-50/60">
                          <td className="px-5 py-3 w-28 text-gray-600 whitespace-nowrap">
                            {h.date.slice(0, 10)}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-900">{h.name}</span>
                              {h.nameEn && (
                                <span className="text-xs text-gray-400">{h.nameEn}</span>
                              )}
                              <span
                                className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${TYPE_STYLE[h.type]}`}
                              >
                                {TYPE_LABEL[h.type]}
                              </span>
                              {h.isOff && (
                                <span className="inline-flex rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                                  放假
                                </span>
                              )}
                              {h.lunar && (
                                <span className="inline-flex rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                                  农历
                                </span>
                              )}
                            </div>
                            {h.note && (
                              <div className="mt-0.5 text-xs text-gray-400">{h.note}</div>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openEdit(h)}
                              className="mr-1 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-500"
                              aria-label="编辑"
                            >
                              <HiOutlinePencilSquare className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(h)}
                              className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                              aria-label="删除"
                            >
                              <HiOutlineTrash className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? '编辑节日' : '新增节日'}
        dismissible={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                日期 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as HolidayType })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="CN">法定节假日（中国）</option>
                <option value="CN_TRAD">传统节日（中国）</option>
                <option value="INTL">国际 / 美国</option>
                <option value="EU">欧洲</option>
                <option value="IN">印度</option>
                <option value="OBS">休假高峰 / 观察期</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              中文名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="如：春节"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">英文名称</label>
            <input
              type="text"
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="如：Chinese New Year"
            />
          </div>
          <div className="flex items-center gap-6">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.isOff}
                onChange={(e) => setForm({ ...form, isOff: e.target.checked })}
                className="rounded border-gray-300"
              />
              放假日
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.lunar}
                onChange={(e) => setForm({ ...form, lunar: e.target.checked })}
                className="rounded border-gray-300"
              />
              农历节日
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="如：正月初一 / 美国"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {submitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Import Modal */}
      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={`批量导入 ${year} 年节假日`}
        size="lg"
        dismissible={false}
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
            <div className="font-semibold mb-1">格式说明（每行一个节日，用 | 分隔字段）：</div>
            <code className="block font-mono text-[11px]">
              YYYY-MM-DD | 中文名 | 类型(CN/CN_TRAD/INTL/EU/IN/OBS) | 放假(0/1) | 英文名 | 备注
            </code>
            <div className="mt-2">例：<code className="font-mono">2027-02-06 | 春节 | CN | 1 | Chinese New Year | 正月初一</code></div>
            <div className="mt-2 text-blue-700">
              ⚠️ 导入会先清空 <b>{year}</b> 年全部节假日，然后再写入新数据。
            </div>
          </div>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={14}
            placeholder="每行一条，使用 | 分隔字段"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleBulkImport}
              disabled={importing}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {importing ? '导入中...' : '导入并替换'}
            </button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
