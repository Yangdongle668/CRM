'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

const labels: Record<string, string> = {
  summary: '最新进展',
  timeline: '项目时间线',
  requirements: '客户需求',
  nextSteps: '下一步建议',
};

type Analysis = {
  count: number;
  limited?: boolean;
  sections?: { name: string; items: { text: string; emailId: string }[] }[];
};

export default function CustomerEmailAnalysis({ customerId }: { customerId: string }) {
  const endpoint = `/emails/customer-ai/${customerId}`;
  const [all, setAll] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string>();
  const [result, setResult] = useState<Analysis>();
  const [failed, setFailed] = useState(false);
  const [latest, setLatest] = useState<Analysis>();
  const [source, setSource] = useState<{ subject: string; bodyText: string }>();

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const analysis = await api.get<unknown, Analysis | null>(endpoint);
        if (!cancelled) setLatest(analysis ?? undefined);
      } catch {
        if (!cancelled) setLatest(undefined);
      }
    }
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
    };
  }, [endpoint]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await api.get<unknown, { state: string; result?: Analysis | null }>(`${endpoint}/${jobId}`);
        if (cancelled) return;
        if (response.state === 'completed') {
          setResult(response.result?.count ? undefined : response.result ?? undefined);
          if (response.result?.count) setLatest(response.result);
          setJobId(undefined);
        } else if (response.state === 'failed' || response.state === 'unknown') {
          setFailed(true);
          setJobId(undefined);
        } else {
          timer = setTimeout(poll, 2500);
        }
      } catch {
        if (cancelled) return;
        setFailed(true);
        setJobId(undefined);
      }
    }
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [endpoint, jobId]);

  async function start() {
    setStarting(true);
    setFailed(false);
    setResult(undefined);
    setSource(undefined);
    try {
      const job = await api.post<unknown, { id: string }>(endpoint, { all });
      setJobId(job.id);
    } catch {
      setFailed(true);
    } finally {
      setStarting(false);
    }
  }

  async function openSource(id: string) {
    try {
      const email = await api.get<unknown, { subject: string; bodyText: string | null; bodyHtml: string | null }>(`/emails/${id}`);
      const template = document.createElement('template');
      template.innerHTML = email.bodyHtml || '';
      template.content.querySelectorAll('script, style').forEach((element) => element.remove());
      setSource({ subject: email.subject, bodyText: email.bodyText || template.content.textContent || '' });
    } catch {
      setSource(undefined);
    }
  }

  const displayed = result ?? latest;

  return (
    <section className="space-y-3 rounded border p-4 text-sm">
      <h3 className="font-semibold">客户邮件 AI 分析</h3>
      <p className="text-gray-600">
        仅将符合条件的客户往来邮件正文提交给已配置的 AI 服务。每次最多 50 封，每封最多 4,000 字符。
      </p>
      <div className="flex flex-wrap gap-2">
        <select aria-label="分析范围" className="rounded border px-2" value={all ? 'all' : 'recent'}
          disabled={starting || !!jobId} onChange={(event) => setAll(event.target.value === 'all')}>
          <option value="recent">最近 180 天</option>
          <option value="all">不限日期（仍有单次上限）</option>
        </select>
        <button type="button" disabled={starting || !!jobId} onClick={start}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">
          {starting || jobId ? '分析中…' : '分析历史邮件'}
        </button>
      </div>
      {failed && <p role="alert" className="text-red-700">分析失败，请检查服务配置后重试。</p>}
      {displayed && (
        <div className="space-y-3">
          <p className="text-gray-600">
            {displayed.count ? `已分析 ${displayed.count} 封邮件${displayed.limited ? '，部分邮件超出单次上限' : ''}。`
              : '此范围内没有符合条件的客户邮件。'}
          </p>
          {displayed.sections?.map(({ name, items }) => (
            <div key={name}>
              <h4 className="font-medium">{labels[name]}</h4>
              {items.length ? (
                <ul className="list-disc space-y-1 pl-5">
                  {items.map(({ text, emailId }, index) => (
                    <li key={`${emailId}-${index}`}>
                      {text}{' '}
                      <button type="button" className="text-blue-700 underline" onClick={() => openSource(emailId)}>
                        查看原文
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-gray-500">暂无</p>}
            </div>
          ))}
          {source && (
            <div className="rounded border p-3">
              <div className="flex justify-between gap-2">
                <h4 className="font-medium">{source.subject}</h4>
                <button type="button" onClick={() => setSource(undefined)}>关闭</button>
              </div>
              <p className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{source.bodyText}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
