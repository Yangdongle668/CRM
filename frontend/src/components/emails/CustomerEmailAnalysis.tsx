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

const phases = [
  ['selecting', '筛选邮件'],
  ['preparing', '逐封准备'],
  ['analyzing', 'AI 批量分析'],
  ['saving', '保存结果'],
  ['done', '完成'],
] as const;
type Progress = { phase: (typeof phases)[number][0]; current?: number; total?: number; subject?: string };
type ApiResponse<T> = { data: T };

type Analysis = {
  count: number;
  rejected?: number;
  reused?: boolean;
  limited?: boolean;
  unverifiedSenders?: string[];
  sections?: { name: string; items: { text: string; emailId: string }[] }[];
};

export default function CustomerEmailAnalysis({ customerId }: { customerId: string }) {
  const endpoint = `/emails/customer-ai/${customerId}`;
  const [all, setAll] = useState(false);
  const [progress, setProgress] = useState<Progress>();
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string>();
  const [result, setResult] = useState<Analysis>();
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean }>();
  const [taskFeedback, setTaskFeedback] = useState<{ text: string; error?: boolean }>();
  const [latest, setLatest] = useState<Analysis>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completing, setCompleting] = useState<string>();
  const [source, setSource] = useState<{ subject: string; bodyText: string; recipient?: string }>();

  const refreshTasks = useCallback(async () => {
    try {
      const { data } = await api.get<unknown, ApiResponse<Task[]>>(`${endpoint}/tasks`);
      setTasks(data);
    } catch {
      // The shared API interceptor displays the error.
    }
  }, [endpoint]);

  async function complete(id: string) {
    setCompleting(id);
    setTaskFeedback({ text: '正在保存完成状态…' });
    try {
      await followUpsApi.done(id);
      setTasks((items) => items.map((item) => item.id === id ? { ...item, status: 'DONE' } : item));
      setTaskFeedback({ text: '待办已标记完成。' });
    } catch {
      setTaskFeedback({ text: '保存失败，待办仍未完成，请重试。', error: true });
    } finally {
      setCompleting(undefined);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const { data: analysis } = await api.get<unknown, ApiResponse<Analysis | null>>(endpoint);
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
    const startedAt = Date.now();
    async function poll() {
      try {
        const { data: response } = await api.get<unknown, ApiResponse<{ state: string; message?: string; result?: Analysis | null; progress?: Progress }>>(`${endpoint}/${jobId}`);
        if (cancelled) return;
        if (response.progress) setProgress(response.progress);
        if (response.state === 'completed') {
          if (response.result) setProgress({ phase: 'done', total: response.result.count });
          setFeedback(response.result
            ? { text: response.result.reused ? `这 ${response.result.count} 封邮件已成功分析过，已显示上次结果。` : response.result.count ? `分析完成，已处理 ${response.result.count} 封邮件。` : '分析完成，没有符合条件的邮件。' }
            : { text: '结果已不可用，邮件归属可能已变更，请重新分析。', error: true });
          setResult(response.result?.count && !response.result.reused ? undefined : response.result ?? undefined);
          if (response.result?.count && !response.result.reused) setLatest(response.result);
          void refreshTasks();
          setJobId(undefined);
        } else if (response.state === 'failed' || response.state === 'unknown') {
          setFeedback({ text: response.message || '分析任务已失效，请重新提交。', error: true });
          setJobId(undefined);
        } else if (Date.now() - startedAt >= 5 * 60 * 1000) {
          setFeedback({ text: '等待超过 5 分钟，后台可能仍在处理。重新打开邮件页可查看最新结果。' });
          setJobId(undefined);
        } else {
          setFeedback({ text: response.state === 'active' ? '正在筛选邮件并等待 AI 分析结果…' : '任务已提交，正在等待后台处理…' });
          timer = setTimeout(poll, 2500);
        }
      } catch {
        if (cancelled) return;
        setFeedback({ text: '暂时无法查询任务状态，后台可能仍在处理。请稍后重新打开邮件页。', error: true });
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
    setProgress(undefined);
    setFeedback({ text: '正在提交分析请求…' });
    setResult(undefined);
    setSource(undefined);
    try {
      const { data: job } = await api.post<unknown, ApiResponse<{ id: string }>>(endpoint, { all, confirmedSender });
      if (!job?.id) throw new Error('Missing job ID');
      setFeedback({ text: '任务已提交，正在等待后台处理…' });
      setJobId(job.id);
    } catch (error) {
      const message = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message;
      setFeedback({ text: typeof message === 'string' ? message : '提交失败，请检查网络连接后重试。', error: true });
    } finally {
      setStarting(false);
    }
  }

  async function openSource(id: string) {
    setTaskFeedback({ text: '正在加载原邮件…' });
    try {
      const { data: email } = await api.get<unknown, ApiResponse<{ subject: string; bodyText: string | null; bodyHtml: string | null; direction: string; fromAddr: string; toAddr: string }>>(`/emails/${id}`);
      const template = document.createElement('template');
      template.innerHTML = email.bodyHtml || '';
      template.content.querySelectorAll('script, style').forEach((element) => element.remove());
      const address = email.direction === 'INBOUND' ? email.fromAddr : email.toAddr;
      const recipient = address?.match(/<([^<>]+)>$/)?.[1] ?? address;
      setSource({
        subject: email.subject, bodyText: email.bodyText || template.content.textContent || '',
        recipient: /^[^\s<>@,;]+@[^\s<>@,;]+$/.test(recipient) ? recipient : undefined,
      });
      setTaskFeedback({ text: '原邮件已打开。' });
    } catch {
      setTaskFeedback({ text: '无法打开原邮件，请检查邮件是否仍可访问。', error: true });
      setSource(undefined);
    }
  }

  const displayed = feedback?.error ? latest : result ?? latest;
  const activePhase = phases.findIndex(([phase]) => phase === progress?.phase);

  return (
    <section className="space-y-3 rounded border p-4 text-sm">
      <h3 className="font-semibold">客户邮件 AI 分析</h3>
      <p className="text-gray-600">
        邮件在提交给 AI 前会屏蔽已识别的公司名、电话、网站和邮箱地址。每次最多 50 封，每封最多 4,000 字符。
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
      {[feedback, taskFeedback].map((message, index) => message && (
        <p key={index} role={message.error ? 'alert' : 'status'}
          className={message.error ? 'rounded bg-red-50 p-2 text-red-700' : 'rounded bg-blue-50 p-2 text-blue-800'}>
          {message.text}
        </p>
      ))}
      {(starting || jobId || progress) && (
        <div className="space-y-2 rounded border p-3" aria-label="邮件分析进度">
          <ol className="flex flex-wrap gap-2">
            {phases.map(([phase, label], index) => (
              <li key={phase} aria-current={index === activePhase ? 'step' : undefined}
                className={`rounded px-2 py-1 ${index === activePhase ? (feedback?.error ? 'bg-red-100 text-red-800' : 'bg-blue-700 text-white') :
                  index < activePhase ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {index + 1}. {label}
              </li>
            ))}
          </ol>
          {progress?.phase === 'preparing' && progress.total && (
            <div>
              <progress className="w-full" aria-label="邮件准备进度" max={progress.total} value={progress.current} />
              <p>正在准备第 {progress.current} / {progress.total} 封 · {progress.subject || '无主题'}</p>
            </div>
          )}
          {progress?.phase === 'analyzing' && (
            <p>已提交 {progress.total} 封邮件，{feedback?.error ? '本次未取得可用结果。' : jobId ? (progress.current && progress.subject
              ? `正在分批重试，第 ${progress.current} 封起 · ${progress.subject}`
              : progress.current ? '正在合并各批分析结果。' : '正在等待 AI 返回整批结果。') : '已停止查询任务状态。'}</p>
          )}
        </div>
      )}
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
          {!!displayed.rejected && <p>已跳过 {displayed.rejected} 条无法验证来源的结果。</p>}
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
