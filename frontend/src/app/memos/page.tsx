'use client';

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { memosApi } from '@/lib/api';
import type { Memo } from '@/types';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
} from 'react-icons/hi2';

const MEMO_COLORS = [
  { value: '#ffffff', label: '白色' },
  { value: '#fef3c7', label: '黄色' },
  { value: '#dbeafe', label: '蓝色' },
  { value: '#dcfce7', label: '绿色' },
  { value: '#fce7f3', label: '粉色' },
  { value: '#f3e8ff', label: '紫色' },
  { value: '#ffedd5', label: '橙色' },
];

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function MemosPage() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(today));
  const [memos, setMemos] = useState<Memo[]>([]);
  const [monthMemos, setMonthMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
  const [form, setForm] = useState({ title: '', content: '', color: '#ffffff', date: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchMonthMemos = useCallback(async () => {
    setLoading(true);
    try {
      const startDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const lastDay = getDaysInMonth(currentYear, currentMonth);
      const endDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const res: any = await memosApi.getByRange(startDate, endDate);
      const data = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
      setMonthMemos(data);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth]);

  useEffect(() => {
    fetchMonthMemos();
  }, [fetchMonthMemos]);

  // Filter memos for selected date
  useEffect(() => {
    const dayMemos = monthMemos.filter((m) => {
      const mDate = new Date(m.date);
      return formatDate(mDate) === selectedDate;
    });
    setMemos(dayMemos);
  }, [selectedDate, monthMemos]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const openCreate = () => {
    setEditingMemo(null);
    setForm({ title: '', content: '', color: '#ffffff', date: selectedDate });
    setModalOpen(true);
  };

  const openEdit = (memo: Memo) => {
    setEditingMemo(memo);
    setForm({
      title: memo.title,
      content: memo.content || '',
      color: memo.color || '#ffffff',
      date: formatDate(new Date(memo.date)),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('请输入标题');
      return;
    }
    setSubmitting(true);
    try {
      if (editingMemo) {
        await memosApi.update(editingMemo.id, form);
        toast.success('备忘录已更新');
      } else {
        await memosApi.create(form);
        toast.success('备忘录已创建');
      }
      setModalOpen(false);
      fetchMonthMemos();
    } catch {
      // handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这条备忘录吗？')) return;
    try {
      await memosApi.delete(id);
      toast.success('已删除');
      fetchMonthMemos();
    } catch {
      // handled by interceptor
    }
  };

  // Calendar rendering
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  const getMemoCountForDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return monthMemos.filter((m) => formatDate(new Date(m.date)) === dateStr).length;
  };

  const todayStr = formatDate(today);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">备忘录</h1>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <HiOutlinePlus className="h-4 w-4" />
            新建备忘
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-apple p-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={handlePrevMonth}
                className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
              >
                <HiOutlineChevronLeft className="h-5 w-5 text-gray-600" />
              </button>
              <h2 className="text-lg font-semibold text-gray-900">
                {currentYear}年{currentMonth + 1}月
              </h2>
              <button
                onClick={handleNextMonth}
                className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
              >
                <HiOutlineChevronRight className="h-5 w-5 text-gray-600" />
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === todayStr;
                const memoCount = getMemoCountForDay(day);

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all text-sm ${
                      isSelected
                        ? 'bg-primary-500 text-white shadow-apple'
                        : isToday
                        ? 'bg-primary-50 text-primary-600 font-semibold'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span>{day}</span>
                    {memoCount > 0 && (
                      <div
                        className={`absolute bottom-1.5 w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-primary-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Memos for selected date */}
          <div className="bg-white rounded-2xl shadow-apple p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">
                {selectedDate.replace(/-/g, '/')} 备忘
              </h3>
              <button
                onClick={openCreate}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <HiOutlinePlus className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex h-32 items-center justify-center text-gray-400 text-sm">
                加载中...
              </div>
            ) : memos.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                <p>暂无备忘录</p>
                <button
                  onClick={openCreate}
                  className="mt-2 text-primary-500 hover:text-primary-600 text-xs"
                >
                  点击添加
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {memos.map((memo) => (
                  <div
                    key={memo.id}
                    className="rounded-xl p-4 border border-gray-100 group transition-all hover:shadow-sm"
                    style={{ backgroundColor: memo.color || '#ffffff' }}
                  >
                    <div className="flex items-start justify-between">
                      <h4 className="text-sm font-medium text-gray-900">{memo.title}</h4>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(memo)}
                          className="rounded p-1 text-gray-400 hover:text-primary-500 hover:bg-white/50"
                        >
                          <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(memo.id)}
                          className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-white/50"
                        >
                          <HiOutlineTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    {memo.content && (
                      <p className="mt-1 text-xs text-gray-600 whitespace-pre-wrap line-clamp-3">
                        {memo.content}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingMemo ? '编辑备忘录' : '新建备忘录'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="请输入标题"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="请输入内容"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">颜色</label>
            <div className="flex gap-2">
              {MEMO_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm({ ...form, color: c.value })}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    form.color === c.value
                      ? 'border-primary-500 scale-110'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
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
              {submitting ? '保存中...' : editingMemo ? '保存修改' : '创建'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
