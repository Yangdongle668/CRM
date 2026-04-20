'use client';

import React, { useEffect, useState } from 'react';
import { ratesApi } from '@/lib/api';

interface RatesData {
  base: string;
  source?: string;
  updatedAt: string;
  rates: { USD_CNY: number; EUR_CNY: number; EUR_USD: number };
}

const SOURCE_LABEL: Record<string, string> = {
  BOC: '中国银行外汇牌价',
  loading: '加载中',
};

export default function ExchangeRates() {
  const [data, setData] = useState<RatesData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRates = async () => {
    try {
      const res: any = await ratesApi.get();
      setData(res.data);
    } catch {
      // silently ignore — optional widget
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRates();
    // Refresh every 15 minutes (matches backend cache TTL; BOC 牌价交易时段内会多次更新)
    const id = setInterval(fetchRates, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-gray-300 border-t-transparent" />
        <span>汇率加载中</span>
      </div>
    );
  }

  if (!data || data.rates.USD_CNY === 0) {
    return null;
  }

  const updatedAt = new Date(data.updatedAt);
  const timeStr = updatedAt.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const sourceLabel = data.source ? SOURCE_LABEL[data.source] || data.source : '';
  const tipPrefix = sourceLabel ? `${sourceLabel} · ` : '';

  return (
    <div
      className="flex items-center gap-3 text-xs font-medium text-gray-600"
      title={`${tipPrefix}更新于 ${timeStr}（每 15 分钟自动刷新）`}
    >
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
        <span className="text-[10px] font-bold tracking-wide">USD</span>
        <span className="text-gray-400">→</span>
        <span>¥ {data.rates.USD_CNY.toFixed(4)}</span>
      </div>
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700">
        <span className="text-[10px] font-bold tracking-wide">EUR</span>
        <span className="text-gray-400">→</span>
        <span>¥ {data.rates.EUR_CNY.toFixed(4)}</span>
      </div>
    </div>
  );
}
