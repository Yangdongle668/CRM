'use client';

import React, { useEffect, useState } from 'react';
import { emailsApi } from '@/lib/api';

interface OpenEvent {
  id: string;
  openedAt: string;
  ip: string | null;
  userAgent: string | null;
  kind: 'HUMAN' | 'PROXY' | 'PREFETCH' | 'BOT' | 'DUP';
  source: 'PIXEL' | 'CLICK_INFERRED';
}
interface ClickEvent {
  id: string;
  clickedAt: string;
  url: string;
  ip: string | null;
  userAgent: string | null;
  kind: OpenEvent['kind'];
}
interface LinkRow {
  id: string;
  linkId: string;
  url: string;
  label: string | null;
  position: number;
}
interface TrackingResponse {
  email: {
    id: string;
    sentAt: string | null;
    firstHumanOpenAt: string | null;
    lastOpenedAt: string | null;
    totalClicks: number;
    viewCount: number;
    openConfidence: number;
  } | null;
  opens: OpenEvent[];
  clicks: ClickEvent[];
  links: LinkRow[];
}

const KIND_STYLES: Record<string, { label: string; className: string }> = {
  HUMAN:    { label: '真实打开',   className: 'bg-green-100 text-green-700' },
  PROXY:    { label: '代理加载',   className: 'bg-emerald-100 text-emerald-700' },
  PREFETCH: { label: '预取',       className: 'bg-amber-100 text-amber-700' },
  BOT:      { label: '机器人/扫描', className: 'bg-gray-100 text-gray-500' },
  DUP:      { label: '重复',       className: 'bg-gray-100 text-gray-400' },
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('zh-CN');
}

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 0.85) return { text: '非常可能已读', color: 'text-green-700' };
  if (score >= 0.6)  return { text: '较大概率已读', color: 'text-emerald-700' };
  if (score >= 0.35) return { text: '可能已读',     color: 'text-amber-700' };
  if (score > 0)     return { text: '仅有弱信号',   color: 'text-orange-600' };
  return { text: '无打开记录', color: 'text-gray-500' };
}

export default function EmailTrackingPanel({ emailId }: { emailId: string }) {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await emailsApi.getTracking(emailId);
      setData(res.data as TrackingResponse);
    } catch {
      /* interceptor shows toast */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (emailId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId]);

  if (!data && loading) {
    return <div className="p-4 text-sm text-gray-400">加载追踪数据...</div>;
  }
  if (!data?.email) {
    return <div className="p-4 text-sm text-gray-400">暂无追踪数据</div>;
  }

  const { email, opens, clicks, links } = data;
  const confidence = email.openConfidence ?? 0;
  const c = confidenceLabel(confidence);

  return (
    <div className="space-y-4 text-sm">
      {/* Confidence header */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">已读置信度</div>
            <div className={`text-2xl font-semibold ${c.color}`}>
              {Math.round(confidence * 100)}%
              <span className="ml-2 text-sm font-normal text-gray-500">
                {c.text}
              </span>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? '...' : '刷新'}
          </button>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full ${
              confidence >= 0.6 ? 'bg-green-500' :
              confidence >= 0.35 ? 'bg-amber-500' :
              confidence > 0 ? 'bg-orange-400' : 'bg-gray-300'
            }`}
            style={{ width: `${Math.min(100, Math.round(confidence * 100))}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Stat label="首次人读" value={fmt(email.firstHumanOpenAt)} />
          <Stat label="最后打开" value={fmt(email.lastOpenedAt)} />
          <Stat label="像素总触发" value={email.viewCount.toString()} />
          <Stat label="点击次数" value={email.totalClicks.toString()} />
        </div>
      </div>

      {/* Opens */}
      <Section title={`打开事件 (${opens.length})`}>
        {opens.length === 0 ? (
          <EmptyRow text="图片未加载 — 可能是客户端屏蔽了图片或 Apple MPP 还未预取。点击事件仍可验证阅读。" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {opens.slice(0, 50).map((o) => (
              <EventRow
                key={o.id}
                when={o.openedAt}
                kind={o.kind}
                ip={o.ip}
                ua={o.userAgent}
                source={o.source === 'CLICK_INFERRED' ? '由点击推断' : '像素加载'}
              />
            ))}
          </ul>
        )}
      </Section>

      {/* Clicks */}
      <Section title={`点击事件 (${clicks.length})`}>
        {clicks.length === 0 ? (
          <EmptyRow text="尚未记录点击" />
        ) : (
          <ul className="divide-y divide-gray-100">
            {clicks.slice(0, 50).map((c) => (
              <li key={c.id} className="py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-gray-500">
                    {fmt(c.clickedAt)}
                  </span>
                  <KindBadge kind={c.kind} />
                </div>
                <div className="mt-0.5 truncate text-xs text-blue-700">
                  → {c.url}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-gray-400">
                  {c.ip || '—'} · {c.userAgent || '—'}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Links inventory */}
      {links.length > 0 && (
        <Section title={`已追踪链接 (${links.length})`}>
          <ul className="space-y-1 text-xs">
            {links.map((l) => (
              <li key={l.id} className="truncate text-gray-600">
                #{l.position + 1}. <span className="text-blue-700">{l.url}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 border border-gray-100 p-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-gray-900 font-mono">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold text-gray-700">
        {title}
      </div>
      <div className="px-4 py-2 max-h-64 overflow-y-auto">{children}</div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="py-3 text-center text-xs text-gray-400">{text}</div>;
}

function KindBadge({ kind }: { kind: OpenEvent['kind'] }) {
  const s = KIND_STYLES[kind] || KIND_STYLES.HUMAN;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${s.className}`}>
      {s.label}
    </span>
  );
}

function EventRow({
  when, kind, ip, ua, source,
}: {
  when: string; kind: OpenEvent['kind']; ip: string | null; ua: string | null; source: string;
}) {
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-gray-500">{fmt(when)}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400">{source}</span>
          <KindBadge kind={kind} />
        </div>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-gray-400">
        {ip || '—'} · {ua || '—'}
      </div>
    </li>
  );
}
