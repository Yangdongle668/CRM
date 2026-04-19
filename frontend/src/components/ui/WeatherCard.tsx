'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiOutlineMapPin,
  HiOutlineArrowPath,
} from 'react-icons/hi2';
import { weatherApi } from '@/lib/api';

const DEFAULT_CITY = '东莞';
const STORAGE_KEY = 'weather:city';

interface WeatherData {
  city: string;
  temp: string;
  description: string;
  source?: string;
}

const weatherEmoji = (desc: string): string => {
  const d = (desc || '').toLowerCase();
  if (d.includes('雷') || d.includes('thunder')) return '⛈️';
  if (d.includes('雪') || d.includes('snow')) return '❄️';
  if (d.includes('雨') || d.includes('rain')) return '🌧️';
  if (d.includes('雾') || d.includes('霾') || d.includes('fog') || d.includes('haze')) return '🌫️';
  if (d.includes('多云') || d.includes('partly')) return '⛅';
  if (d.includes('阴') || d.includes('云') || d.includes('cloud')) return '☁️';
  if (d.includes('晴') || d.includes('sun') || d.includes('clear')) return '☀️';
  return '🌡️';
};

export default function WeatherCard() {
  const [city, setCity] = useState<string>(DEFAULT_CITY);
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState<string>(DEFAULT_CITY);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchWeather = useCallback(async (target: string) => {
    const name = target.trim();
    if (!name) return;
    setLoading(true);
    setError(null);
    try {
      // 走后端 /api/weather，多数据源轮询：前端不再关心具体上游，
      // 彻底避开浏览器 CORS / 混合内容导致的 Failed to fetch。
      const res: any = await weatherApi.get(name);
      const payload = res?.data || res;
      if (!payload?.temp) throw new Error('无数据');
      setData({
        city: String(payload.city || name).replace(/市$/, ''),
        temp: String(payload.temp),
        description: String(payload.description || ''),
        source: payload.source,
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || '获取失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_CITY;
    setCity(saved);
    setInputValue(saved);
    fetchWeather(saved);
  }, [fetchWeather]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    const next = inputValue.trim();
    setEditing(false);
    if (!next || next === city) {
      setInputValue(city);
      return;
    }
    setCity(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next);
    }
    fetchWeather(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') {
      setInputValue(city);
      setEditing(false);
    }
  };

  const displayCity = data?.city || city;
  const title = data?.source
    ? `数据源：${data.source}`
    : '点击地点可更换城市';

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1.5 text-sm text-gray-700 shadow-sm"
      title={title}
    >
      <span className="text-base leading-none">
        {data ? weatherEmoji(data.description) : '🌡️'}
      </span>

      <span className="font-medium text-gray-900 tabular-nums">
        {loading ? '…' : data ? `${data.temp}°` : '--'}
      </span>

      <span className="text-gray-500 truncate max-w-[6rem]">
        {loading ? '加载中' : error ? error : data?.description || '—'}
      </span>

      <span className="h-4 w-px bg-gray-200" aria-hidden />

      {editing ? (
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          placeholder="输入城市"
          className="w-24 bg-transparent text-gray-700 placeholder-gray-400 outline-none text-sm"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setInputValue(city);
            setEditing(true);
          }}
          className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
        >
          <HiOutlineMapPin className="h-3.5 w-3.5" />
          <span className="max-w-[5rem] truncate">{displayCity}</span>
        </button>
      )}

      <button
        type="button"
        onClick={() => fetchWeather(city)}
        disabled={loading}
        className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
        title="刷新"
      >
        <HiOutlineArrowPath
          className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
        />
      </button>
    </div>
  );
}
