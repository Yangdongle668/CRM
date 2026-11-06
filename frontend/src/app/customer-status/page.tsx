'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import api from '@/lib/api';

const statusLabels = {
  CURRENT: '已分析最新邮件',
  STALE: '有邮件待更新',
  NEEDS_ANALYSIS: '待分析',
  NO_MAIL: '暂无往来邮件',
};

type CustomerOverview = {
  id: string;
  companyName: string;
  hidden: boolean;
  freshness: keyof typeof statusLabels;
  latest: { id: string; subject: string; direction: 'INBOUND' | 'OUTBOUND'; at: string; snippet: string | null } | null;
  analyzedAt: string | null;
  summary: { text: string; emailId: string; at: string }[];
};

const mailUrl = (id: string) => `/emails?emailId=${encodeURIComponent(id)}`;
const formatTime = (date: string) => new Date(date).toLocaleString('zh-CN');

export default function CustomerStatusPage() {
  const [customers, setCustomers] = useState<CustomerOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState<string>();

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setFailed(false);
    try {
      const { data } = await api.get<unknown, { data: CustomerOverview[] }>('/emails/customer-ai-overview');
      setCustomers(data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(true); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  async function setVisibility(id: string, hidden: boolean) {
    setSaving(id);
    try {
      await api.patch(`/emails/customer-ai-overview/${id}/visibility`, { hidden });
      setCustomers((items) => items.map((item) => item.id === id ? { ...item, hidden } : item));
    } catch {
      // The shared API interceptor reports the error.
    } finally {
      setSaving(undefined);
    }
  }

  const hiddenCards = customers.filter(({ hidden }) => hidden);

  const query = search.trim().toLowerCase();
  const filtered = customers
    .filter(({ companyName, hidden }) => !hidden && companyName.toLowerCase().includes(query))
    .sort((a, b) => {
      const aTime = a.latest ? Date.parse(a.latest.at) : Number.NEGATIVE_INFINITY;
      const bTime = b.latest ? Date.parse(b.latest.at) : Number.NEGATIVE_INFINITY;
      return (bTime - aTime) || a.companyName.localeCompare(b.companyName, 'zh-CN');
    });
  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">客户目前情况</h1>
            <p className="text-sm text-gray-600">我负责的 {customers.length} 个客户 · 根据最近邮件和已保存的分析更新</p>
          </div>
          <button type="button" disabled={loading} onClick={() => load()} className="rounded border bg-white px-3 py-2 text-sm">
            {loading ? '加载中…' : '刷新'}
          </button>
        </div>
        <input aria-label="搜索客户" placeholder="搜索客户" value={search} onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded border p-2 sm:max-w-xs" />
        {!!hiddenCards.length && (
          <details className="rounded border bg-white p-3 text-sm">
            <summary className="cursor-pointer font-medium">添加已隐藏的客户卡片（{hiddenCards.length}）</summary>
            <p className="my-2 text-xs text-gray-600">隐藏后收到关联的新来信，卡片会自动恢复。</p>
            <ul className="space-y-2">
              {hiddenCards.map(({ id, companyName }) => (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span>{companyName}</span>
                  <button type="button" disabled={!!saving} onClick={() => setVisibility(id, false)}
                    className="rounded border px-2 py-1 text-blue-700 disabled:opacity-50">添加</button>
                </li>
              ))}
            </ul>
          </details>
        )}
        {failed && <p role="alert" className="text-red-700">加载失败，请点击刷新重试。</p>}
        {!loading && !failed && !filtered.length && <p className="text-gray-600">没有符合条件的客户。</p>}
        <div className="grid gap-3 lg:grid-cols-2" aria-busy={loading}>
          {filtered.map((customer) => (
            <article key={customer.id} className="space-y-3 rounded-lg border bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/customers/${customer.id}?tab=emails`} className="text-base font-semibold text-blue-700">
                  {customer.companyName}
                </Link>
                <span className={`rounded px-2 py-1 text-xs ${customer.freshness === 'CURRENT' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                  {statusLabels[customer.freshness]}
                </span>
              </div>
              <button type="button" disabled={!!saving} onClick={() => setVisibility(customer.id, true)}
                className="text-xs text-gray-600 underline disabled:opacity-50">隐藏卡片</button>
              {customer.latest && (
                <div>
                  <p className="text-xs text-gray-600">
                    {customer.latest.direction === 'INBOUND' ? '最新客户来信' : '最新我方发件'} · {formatTime(customer.latest.at)}
                  </p>
                  <Link href={mailUrl(customer.latest.id)} className="break-words text-blue-700 hover:underline">
                    {customer.latest.subject || '无主题'}
                  </Link>
                  {customer.latest.snippet && (
                    <p className="mt-1 break-words text-gray-600">{customer.latest.snippet}</p>
                  )}
                </div>
              )}
              {customer.summary.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-gray-600">
                    {customer.freshness === 'STALE' ? '上次分析摘要' : '目前情况'}
                    {customer.analyzedAt && ` · ${formatTime(customer.analyzedAt)}`}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {customer.summary.map(({ text, emailId, at }, index) => (
                      <li key={`${emailId}-${index}`} className="break-words">
                        <time dateTime={at} className="mr-2 text-xs text-gray-500">{formatTime(at)}</time>
                        {text} <Link href={mailUrl(emailId)} className="text-blue-700 underline">来源</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <p className="text-gray-600">{customer.latest ? '暂无可显示的分析摘要。' : '该客户暂未发现往来邮件。'}</p>}
            </article>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
