'use client';

import React, { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { memosApi } from '@/lib/api';
import type { Memo, MemoTimelineEntry } from '@/types';
import { solar2lunar, getSolarTerm } from '@/lib/lunar';
import { getHolidayMap, type ComputedHoliday } from '@/lib/holidays';
import {
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencilSquare,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineBookmark,
  HiOutlineCheckCircle,
  HiOutlineClock,
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
const MONTH_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

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

function parseDateOnly(iso: string): Date {
  // Backend returns ISO dates; we want the local Y/M/D the admin typed,
  // so slice to the date portion before constructing.
  return new Date(iso.slice(0, 10) + 'T00:00:00');
}

// Map holiday type → tailwind color tokens for dot + text
const HOLIDAY_STYLE: Record<string, { text: string; dot: string; bg: string; label: string }> = {
  CN: { text: 'text-red-600', dot: 'bg-red-500', bg: 'bg-red-50', label: '法定节假日' },
  CN_TRAD: { text: 'text-amber-700', dot: 'bg-amber-500', bg: 'bg-amber-50', label: '传统节日' },
  INTL: { text: 'text-indigo-600', dot: 'bg-indigo-500', bg: 'bg-indigo-50', label: '国际节日' },
  EU: { text: 'text-sky-600', dot: 'bg-sky-500', bg: 'bg-sky-50', label: '欧洲节日' },
  IN: { text: 'text-orange-600', dot: 'bg-orange-500', bg: 'bg-orange-50', label: '印度节日' },
};

export default function MemosPage() {
  // useSearchParams() requires Suspense for Next 14 静态预渲染（CSR bailout）。
  // 包一层 Suspense 即可，让 /memos 走 dynamic rendering。
  return (
    <Suspense fallback={null}>
      <MemosPageContent />
    </Suspense>
  );
}

function MemosPageContent() {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(formatDate(today));
  const [memos, setMemos] = useState<Memo[]>([]);
  const [monthMemos, setMonthMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);

  // ===== 跟进备忘 (pinned) =====
  const [pinnedMemos, setPinnedMemos] = useState<Memo[]>([]);
  const [pinnedFilter, setPinnedFilter] = useState<'ACTIVE' | 'DONE' | 'ALL'>('ACTIVE');
  const [pinnedLoading, setPinnedLoading] = useState(false);
  // 时间线弹窗（点开某个跟进卡片时显示）
  const [timelineMemoId, setTimelineMemoId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState({ contactedAt: formatDate(today), note: '' });
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
  const [form, setForm] = useState({
    title: '',
    content: '',
    color: '#ffffff',
    date: '',
    pinned: false,
  });
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

  const fetchPinned = useCallback(async () => {
    setPinnedLoading(true);
    try {
      const res: any = await memosApi.pinned(
        pinnedFilter === 'ALL' ? undefined : pinnedFilter,
      );
      const data = Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : [];
      setPinnedMemos(data);
    } catch {
      // handled by interceptor
    } finally {
      setPinnedLoading(false);
    }
  }, [pinnedFilter]);

  useEffect(() => {
    fetchPinned();
  }, [fetchPinned]);

  // 仪表盘"客户跟进" widget 点开某条跟进时，会带 ?followUp=<id> 跳过来 —
  // 这里读 query 参数自动打开对应时间线弹窗，然后清掉 URL 参数避免回访时再次弹出
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const targetId = searchParams.get('followUp');
    if (targetId) {
      setTimelineMemoId(targetId);
      router.replace('/memos');
    }
  }, [searchParams, router]);

  // 时间线弹窗：始终读取最新的 pinnedMemos 里那一条，保证添加/删除条目后实时反映
  const timelineMemo = useMemo(
    () => pinnedMemos.find((m) => m.id === timelineMemoId) ?? null,
    [pinnedMemos, timelineMemoId],
  );

  // Filter memos for selected date
  useEffect(() => {
    const dayMemos = monthMemos.filter((m) => {
      const mDate = new Date(m.date);
      return formatDate(mDate) === selectedDate;
    });
    setMemos(dayMemos);
  }, [selectedDate, monthMemos]);

  // 本地算当年 + 邻年的节假日，切月份时跨年也能拿到数据
  const holidayMap = useMemo(() => {
    const map = new Map<string, ComputedHoliday[]>();
    for (const y of [currentYear - 1, currentYear, currentYear + 1]) {
      getHolidayMap(y).forEach((arr, date) => {
        const existing = map.get(date);
        if (existing) existing.push(...arr);
        else map.set(date, [...arr]);
      });
    }
    return map;
  }, [currentYear]);

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

  const goToday = () => {
    const n = new Date();
    setCurrentYear(n.getFullYear());
    setCurrentMonth(n.getMonth());
    setSelectedDate(formatDate(n));
  };

  const openCreate = (defaults?: { pinned?: boolean }) => {
    setEditingMemo(null);
    setForm({
      title: '',
      content: '',
      color: '#ffffff',
      date: selectedDate,
      pinned: defaults?.pinned ?? false,
    });
    setModalOpen(true);
  };

  const openEdit = (memo: Memo) => {
    setEditingMemo(memo);
    setForm({
      title: memo.title,
      content: memo.content || '',
      color: memo.color || '#ffffff',
      date: formatDate(new Date(memo.date)),
      pinned: !!memo.pinned,
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
        toast.success(form.pinned ? '跟进备忘已创建' : '备忘录已创建');
      }
      setModalOpen(false);
      // 同时刷新两个 list — 用户可能在编辑时切换了 pinned 状态
      fetchMonthMemos();
      fetchPinned();
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
      fetchPinned();
      if (timelineMemoId === id) setTimelineMemoId(null);
    } catch {
      // handled by interceptor
    }
  };

  // ===== 跟进备忘卡片 / 时间线 =====
  const openTimeline = (memoId: string) => {
    setTimelineMemoId(memoId);
    setEntryForm({ contactedAt: formatDate(new Date()), note: '' });
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!timelineMemoId) return;
    if (!entryForm.note.trim()) {
      toast.error('请输入跟进内容');
      return;
    }
    setEntrySubmitting(true);
    try {
      await memosApi.addTimelineEntry(timelineMemoId, entryForm);
      toast.success('已记录');
      setEntryForm({ contactedAt: formatDate(new Date()), note: '' });
      fetchPinned();
    } catch {
      // handled by interceptor
    } finally {
      setEntrySubmitting(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('删除这条跟进记录？')) return;
    try {
      await memosApi.deleteTimelineEntry(entryId);
      toast.success('已删除');
      fetchPinned();
    } catch {
      // handled by interceptor
    }
  };

  const togglePinnedStatus = async (memo: Memo) => {
    const next = memo.pinnedStatus === 'DONE' ? 'ACTIVE' : 'DONE';
    try {
      await memosApi.update(memo.id, { pinnedStatus: next });
      toast.success(next === 'DONE' ? '已标记为完成' : '已恢复跟进');
      fetchPinned();
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
  // Pad to full 6-row grid for consistent layout
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);
  while (calendarDays.length < 42) calendarDays.push(null);

  const getMemoCountForDay = (day: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return monthMemos.filter((m) => formatDate(new Date(m.date)) === dateStr).length;
  };

  const todayStr = formatDate(today);

  // Selected-day metadata for the right panel
  const selectedDt = parseDateOnly(selectedDate);
  const selectedLunar = solar2lunar(selectedDt);
  const selectedHolidays = holidayMap.get(selectedDate) ?? [];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">备忘录</h1>
            <p className="text-xs text-gray-500 mt-1">集成农历、节气与国内外节假日</p>
          </div>
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
          >
            <HiOutlinePlus className="h-4 w-4" />
            新建备忘
          </button>
        </div>

        {/* 跟进备忘 —— 常驻列表，不绑日历日期。
            点开卡片可查看完整时间线 / 添加"几号联系了"记录 */}
        <div className="bg-white rounded-2xl shadow-apple p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HiOutlineBookmark className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-gray-900">客户跟进</h2>
              <span className="text-xs text-gray-400">
                常驻显示，不会随日期消失
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
                {([
                  { v: 'ACTIVE', label: '进行中' },
                  { v: 'DONE', label: '已完成' },
                  { v: 'ALL', label: '全部' },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setPinnedFilter(opt.v)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      pinnedFilter === opt.v
                        ? 'bg-white shadow-sm text-gray-900 font-medium'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => openCreate({ pinned: true })}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <HiOutlinePlus className="h-3.5 w-3.5" />
                新建跟进
              </button>
            </div>
          </div>

          {pinnedLoading && pinnedMemos.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-gray-400">
              加载中...
            </div>
          ) : pinnedMemos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-sm text-gray-400">
              <p>{pinnedFilter === 'DONE' ? '暂无已完成的跟进' : '暂无客户跟进'}</p>
              <button
                onClick={() => openCreate({ pinned: true })}
                className="mt-1.5 text-primary-500 hover:text-primary-600 text-xs"
              >
                添加第一条跟进
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {pinnedMemos.map((memo) => {
                const lastEntry = memo.timeline?.[0];
                const lastEntryDate = lastEntry
                  ? new Date(lastEntry.contactedAt)
                  : null;
                const daysSince = lastEntryDate
                  ? Math.floor(
                      (Date.now() - lastEntryDate.getTime()) / 86400000,
                    )
                  : null;
                const isDone = memo.pinnedStatus === 'DONE';
                return (
                  <button
                    key={memo.id}
                    type="button"
                    onClick={() => openTimeline(memo.id)}
                    className={`text-left rounded-xl border p-4 transition-all hover:shadow-sm ${
                      isDone
                        ? 'border-gray-200 bg-gray-50 opacity-75'
                        : 'border-gray-200 bg-white hover:border-primary-300'
                    }`}
                    style={
                      !isDone && memo.color && memo.color !== '#ffffff'
                        ? { backgroundColor: memo.color }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {memo.title}
                        </h3>
                        {memo.content && (
                          <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                            {memo.content}
                          </p>
                        )}
                      </div>
                      {isDone ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          <HiOutlineCheckCircle className="h-3 w-3" /> 已完成
                        </span>
                      ) : daysSince !== null ? (
                        <span
                          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            daysSince <= 1
                              ? 'bg-green-50 text-green-700'
                              : daysSince <= 7
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          <HiOutlineClock className="h-3 w-3" />
                          {daysSince === 0 ? '今天' : `${daysSince}天前`}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          暂未跟进
                        </span>
                      )}
                    </div>

                    {/* 最近 3 条时间线预览 */}
                    {memo.timeline && memo.timeline.length > 0 ? (
                      <ul className="space-y-1 mt-2">
                        {memo.timeline.slice(0, 3).map((e) => (
                          <li
                            key={e.id}
                            className="flex items-start gap-2 text-xs text-gray-600"
                          >
                            <span className="font-mono text-gray-400 whitespace-nowrap">
                              {new Date(e.contactedAt)
                                .toLocaleDateString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                })
                                .replace('/', '-')}
                            </span>
                            <span className="truncate">{e.note}</span>
                          </li>
                        ))}
                        {memo.timeline.length > 3 && (
                          <li className="text-[11px] text-gray-400 pl-1">
                            还有 {memo.timeline.length - 3} 条…
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-gray-400 italic mt-2">
                        点击添加首次跟进记录
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-apple p-6">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevMonth}
                  className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
                  aria-label="上一月"
                >
                  <HiOutlineChevronLeft className="h-5 w-5 text-gray-600" />
                </button>
                <h2 className="text-lg font-semibold text-gray-900 min-w-[7rem] text-center">
                  {currentYear} 年 {MONTH_NAMES[currentMonth]}月
                </h2>
                <button
                  onClick={handleNextMonth}
                  className="rounded-lg p-2 hover:bg-gray-100 transition-colors"
                  aria-label="下一月"
                >
                  <HiOutlineChevronRight className="h-5 w-5 text-gray-600" />
                </button>
              </div>
              <button
                onClick={goToday}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                今天
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1 border-b border-gray-100">
              {WEEKDAYS.map((day, i) => (
                <div
                  key={day}
                  className={`text-center text-xs font-medium py-2 ${
                    i === 0 || i === 6 ? 'text-red-400' : 'text-gray-500'
                  }`}
                >
                  周{day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 mt-2">
              {calendarDays.map((day, idx) => {
                if (day === null) {
                  return <div key={`empty-${idx}`} className="h-[52px] sm:h-[68px]" />;
                }
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const isSelected = dateStr === selectedDate;
                const isToday = dateStr === todayStr;
                const dow = idx % 7;
                const isWeekend = dow === 0 || dow === 6;
                const memoCount = getMemoCountForDay(day);

                const dt = new Date(currentYear, currentMonth, day);
                const lunar = solar2lunar(dt);
                const solarTerm = getSolarTerm(dt);
                const cellHolidays = holidayMap.get(dateStr) ?? [];
                // Priority: CN (legal) > CN_TRAD > INTL > EU > IN
                const primaryHoliday =
                  cellHolidays.find((h) => h.type === 'CN') ??
                  cellHolidays.find((h) => h.type === 'CN_TRAD') ??
                  cellHolidays.find((h) => h.type === 'INTL') ??
                  cellHolidays.find((h) => h.type === 'EU') ??
                  cellHolidays.find((h) => h.type === 'IN') ??
                  cellHolidays[0];

                // Bottom label: holiday name > solar term > lunar label
                const bottomLabel = primaryHoliday?.name ?? solarTerm ?? lunar?.label ?? '';
                const bottomStyle = primaryHoliday
                  ? HOLIDAY_STYLE[primaryHoliday.type]?.text
                  : solarTerm
                  ? 'text-emerald-600'
                  : lunar?.lunarDay === 1
                  ? 'text-primary-600 font-medium'
                  : 'text-gray-400';

                const numberColor = isSelected
                  ? 'text-white'
                  : primaryHoliday?.type === 'CN' && primaryHoliday.isOff
                  ? 'text-red-600'
                  : isWeekend
                  ? 'text-red-500'
                  : 'text-gray-800';

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`relative h-[52px] sm:h-[68px] rounded-xl flex flex-col items-center justify-center px-1 transition-all group ${
                      isSelected
                        ? 'bg-primary-500 shadow-apple'
                        : isToday
                        ? 'bg-primary-50 ring-1 ring-primary-200'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Holiday off-day indicator (top-right corner) */}
                    {primaryHoliday?.isOff && !isSelected && (
                      <span className="absolute top-1 right-1 text-[9px] font-medium text-red-500 leading-none">
                        休
                      </span>
                    )}
                    {/* Solar number */}
                    <span className={`text-base leading-none ${numberColor} ${isToday && !isSelected ? 'font-semibold' : ''}`}>
                      {day}
                    </span>
                    {/* Lunar / holiday label */}
                    {bottomLabel && (
                      <span
                        className={`mt-1 text-[10px] leading-tight truncate max-w-full ${
                          isSelected ? 'text-white/90' : bottomStyle
                        }`}
                      >
                        {bottomLabel}
                      </span>
                    )}
                    {/* Memo indicator */}
                    {memoCount > 0 && (
                      <span
                        className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-primary-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" /> 法定节假日
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> 传统节日
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-500" /> 国际节日
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-sky-500" /> 欧洲节日
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-orange-500" /> 印度节日
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> 节气
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400" /> 有备忘
              </span>
            </div>
          </div>

          {/* Memos for selected date */}
          <div className="bg-white rounded-2xl shadow-apple p-6 flex flex-col">
            {/* Date header with lunar + holiday info */}
            <div className="border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold text-gray-900">
                    {selectedDate.slice(5).replace('-', ' / ')}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {selectedDate.slice(0, 4)} 年 · 周{WEEKDAYS[selectedDt.getDay()]}
                  </div>
                  {selectedLunar && (
                    <div className="mt-2 text-xs text-gray-600">
                      农历 <span className="text-gray-900">{selectedLunar.monthText}{selectedLunar.dayText}</span>
                      <span className="ml-2 text-gray-400">
                        {selectedLunar.ganzhi}年 · 生肖{selectedLunar.zodiac}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => openCreate()}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  aria-label="新建备忘"
                >
                  <HiOutlinePlus className="h-4 w-4" />
                </button>
              </div>

              {/* Holiday tags */}
              {selectedHolidays.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedHolidays.map((h, i) => {
                    const style = HOLIDAY_STYLE[h.type];
                    return (
                      <span
                        key={`${h.date}-${h.name}-${i}`}
                        title={h.nameEn || h.note || ''}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${style?.bg ?? 'bg-gray-50'} ${style?.text ?? 'text-gray-600'}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${style?.dot ?? 'bg-gray-400'}`} />
                        {h.name}
                        {h.nameEn && <span className="opacity-60">· {h.nameEn}</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Memos list */}
            <div className="flex-1 min-h-0">
              {loading ? (
                <div className="flex h-32 items-center justify-center text-gray-400 text-sm">
                  加载中...
                </div>
              ) : memos.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
                  <p>暂无备忘录</p>
                  <button
                    onClick={() => openCreate()}
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
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingMemo
            ? form.pinned
              ? '编辑跟进备忘'
              : '编辑备忘录'
            : form.pinned
            ? '新建跟进备忘'
            : '新建备忘录'
        }
        dismissible={false}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标题 *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder={form.pinned ? '例如：ABC公司跟进' : '请输入标题'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {form.pinned ? '说明（可选）' : '内容'}
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder={form.pinned ? '一句话说明这个跟进是什么…' : '请输入内容'}
            />
          </div>
          {!form.pinned && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">日期</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          )}
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

          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="h-4 w-4 rounded text-primary-500 focus:ring-primary-500"
            />
            <div className="text-sm">
              <span className="font-medium text-gray-800">设为客户跟进</span>
              <span className="ml-1 text-xs text-gray-500">
                — 常驻显示，可记录"几号联系了"时间线，不会随日期消失
              </span>
            </div>
          </label>

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

      {/* 跟进时间线弹窗 */}
      <Modal
        open={!!timelineMemo}
        onClose={() => setTimelineMemoId(null)}
        title={timelineMemo?.title || '客户跟进'}
        maxWidth="2xl"
      >
        {timelineMemo && (
          <div className="space-y-5">
            {timelineMemo.content && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                {timelineMemo.content}
              </p>
            )}

            {/* 操作栏 */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => togglePinnedStatus(timelineMemo)}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  timelineMemo.pinnedStatus === 'DONE'
                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                <HiOutlineCheckCircle className="h-3.5 w-3.5" />
                {timelineMemo.pinnedStatus === 'DONE' ? '恢复跟进' : '标记完成'}
              </button>
              <button
                type="button"
                onClick={() => {
                  openEdit(timelineMemo);
                  setTimelineMemoId(null);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <HiOutlinePencilSquare className="h-3.5 w-3.5" />
                编辑信息
              </button>
              <button
                type="button"
                onClick={() => handleDelete(timelineMemo.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 ml-auto"
              >
                <HiOutlineTrash className="h-3.5 w-3.5" />
                删除跟进
              </button>
            </div>

            {/* 新增时间线条目 */}
            <form
              onSubmit={handleAddEntry}
              className="rounded-xl border border-primary-100 bg-primary-50/40 p-3 space-y-2"
            >
              <div className="flex items-center gap-2 text-xs font-medium text-primary-700">
                <HiOutlinePlus className="h-3.5 w-3.5" />
                记录一次跟进
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="date"
                  value={entryForm.contactedAt}
                  onChange={(e) =>
                    setEntryForm({ ...entryForm, contactedAt: e.target.value })
                  }
                  className="sm:w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <input
                  type="text"
                  value={entryForm.note}
                  onChange={(e) =>
                    setEntryForm({ ...entryForm, note: e.target.value })
                  }
                  placeholder="例如：客户回复了报价单 / 已发样品 / 对方在出差…"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <button
                  type="submit"
                  disabled={entrySubmitting}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {entrySubmitting ? '...' : '添加'}
                </button>
              </div>
            </form>

            {/* 时间线 */}
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2 px-1">
                跟进时间线 · 共 {timelineMemo.timeline?.length || 0} 条
              </div>
              {!timelineMemo.timeline || timelineMemo.timeline.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-400">
                  还没有跟进记录，添加第一条吧
                </div>
              ) : (
                <ol className="relative border-l border-gray-200 pl-5 space-y-3">
                  {timelineMemo.timeline.map((e: MemoTimelineEntry) => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-primary-500 ring-4 ring-white" />
                      <div className="flex items-start justify-between gap-3 group">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-mono text-gray-500">
                            {new Date(e.contactedAt).toLocaleDateString(
                              'zh-CN',
                              {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                weekday: 'short',
                              },
                            )}
                          </div>
                          <div className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap break-words">
                            {e.note}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEntry(e.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity p-1"
                          aria-label="删除"
                        >
                          <HiOutlineTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
