'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import api, { followUpsApi } from '@/lib/api';

const labels: Record<string, string> = {
  summary: '最新进展',
  people: '往来人员',
  timeline: '项目时间线',
  requirements: '客户需求',
  nextSteps: '下一步建议',
};

type Task = { id: string; notes: string | null; triggerEmailId: string | null; status: string };

type Analysis = {
  count: number;
  limited?: boolean;
  unverifiedSenders?: string[];
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completing, setCompleting] = useState<string>();
  const [source, setSource] = useState<{ subject: string; bodyText: string; recipient?: string }>();

  const refreshTasks = useCallback(async () => {
    try {
      setTasks(await api.get<unknown, Task[]>(`${endpoint}/tasks`));
    } catch {
      // The shared API interceptor displays the error.
    }
  }, [endpoint]);

  async function complete(id: string) {
    setCompleting(id);
    try {
      await followUpsApi.done(id);
      setTasks((items) => items.map((item) => item.id === id ? { ...item, status: 'DONE' } : item));
    } catch {
      // Keep the card pending if the update fails.
    } finally {
      setCompleting(undefined);
    }
  }

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
    void refreshTasks();
    window.addEventListener('focus', refresh);
    window.addEventListener('focus', refreshTasks);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('focus', refreshTasks);
    };
  }, [endpoint, refreshTasks]);

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
          void refreshTasks();
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
  }, [endpoint, jobId, refreshTasks]);

  async function start(confirmedSender?: string) {
    setStarting(true);
    setFailed(false);
    setResult(undefined);
    setSource(undefined);
    try {
      const job = await api.post<unknown, { id: string }>(endpoint, { all, confirmedSender });
      setJobId(job.id);
    } catch {
      setFailed(true);
    } finally {
      setStarting(false);
    }
  }

  async function openSource(id: string) {
    try {
      const email = await api.get<unknown, { subject: string; bodyText: string | null; bodyHtml: string | null; direction: string; fromAddr: string; toAddr: string }>(`/emails/${id}`);
      const template = document.createElement('template');
      template.innerHTML = email.bodyHtml || '';
      template.content.querySelectorAll('script, style').forEach((element) => element.remove());
      const address = email.direction === 'INBOUND' ? email.fromAddr : email.toAddr;
      const recipient = address?.match(/<([^<>]+)>$/)?.[1] ?? address;
      setSource({
        subject: email.subject, bodyText: email.bodyText || template.content.textContent || '',
        recipient: /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(recipient) ? recipient : undefined,
      });
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
        <button type="button" disabled={starting || !!jobId} onClick={() => start()}
          className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50">
          {starting || jobId ? '分析中…' : '分析历史邮件'}
        </button>
      </div>
      {failed && <p role="alert" className="text-red-700">分析失败，请检查服务配置后重试。</p>}
      {!!tasks.length && (
        <div className="space-y-2">
          <h4 className="font-semibold">邮件跟进待办</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {tasks.map((task) => (
              <article key={task.id} className="space-y-2 rounded border p-3">
                <p className="whitespace-pre-wrap break-words">{task.notes}</p>
                <div className="flex flex-wrap gap-3">
                  {task.triggerEmailId && (
                    <button type="button" className="text-blue-700 underline"
                      onClick={() => openSource(task.triggerEmailId!)}>打开邮件跟进</button>
                  )}
                  {task.status === 'DONE' ? (
                    <span className="text-gray-500">已完成</span>
                  ) : (
                    <button type="button" className="text-green-700 underline" disabled={!!completing}
                      onClick={() => complete(task.id)}>标记已完成</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {source && (
        <div className="rounded border p-3">
          <div className="flex justify-between gap-2">
            <h4 className="font-medium">{source.subject}</h4>
            <button type="button" onClick={() => setSource(undefined)}>关闭</button>
          </div>
          {source.recipient && (
            <Link href={`/emails?composeTo=${encodeURIComponent(source.recipient)}`} className="text-blue-700 underline">
              写跟进邮件
            </Link>
          )}
          <p className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{source.bodyText}</p>
        </div>
      )}
      {displayed && (
        <div className="space-y-3">
          <p className="text-gray-600">
            {displayed.count ? `已分析 ${displayed.count} 封邮件${displayed.limited ? '，部分邮件超出单次上限' : ''}。`
              : '此范围内没有符合条件的客户邮件。'}
          </p>
          {!!displayed.unverifiedSenders?.length && (
            <div className="space-y-2">
              <p>以下发件人已出现在该客户的邮件列表，但尚未登记为联系人。确认是该客户后，可授权本次分析。</p>
              {displayed.unverifiedSenders.map((address) => (
                <button key={address} type="button" disabled={starting || !!jobId}
                  onClick={() => start(address)} className="mr-2 rounded border px-2 py-1">
                  确认并分析 {address}
                </button>
              ))}
            </div>
          )}
          {displayed.sections?.filter(({ name }) => name !== 'nextSteps' || !tasks.length).map(({ name, items }) => (
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

        </div>
      )}
    </section>
  );
}
