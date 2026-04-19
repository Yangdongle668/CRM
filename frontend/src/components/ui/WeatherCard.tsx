'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiOutlineMapPin,
  HiOutlinePencil,
  HiOutlineArrowPath,
} from 'react-icons/hi2';

const DEFAULT_CITY = '东莞';
const STORAGE_KEY = 'weather:city';
const WEATHER_API_BASE = 'https://wttr.in';

interface WeatherData {
  city: string;
  tempC: string;
  feelsLikeC: string;
  description: string;
  humidity: string;
  windSpeedKmph: string;
  windDir: string;
  updatedAt: string;
}

const weatherEmoji = (desc: string): string => {
  const d = desc.toLowerCase();
  if (d.includes('thunder') || d.includes('雷')) return '⛈️';
  if (d.includes('snow') || d.includes('雪')) return '❄️';
  if (d.includes('rain') || d.includes('drizzle') || d.includes('雨')) return '🌧️';
  if (d.includes('fog') || d.includes('mist') || d.includes('雾') || d.includes('haze')) return '🌫️';
  if (d.includes('cloud') || d.includes('overcast') || d.includes('云') || d.includes('阴')) return '☁️';
  if (d.includes('partly') || d.includes('多云')) return '⛅';
  if (d.includes('sun') || d.includes('clear') || d.includes('晴')) return '☀️';
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
      const url = `${WEATHER_API_BASE}/${encodeURIComponent(name)}?format=j1&lang=zh`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const cur = json?.current_condition?.[0];
      const area = json?.nearest_area?.[0];
      if (!cur) throw new Error('未返回天气数据');
      const zhDesc =
        cur.lang_zh?.[0]?.value ||
        cur.weatherDesc?.[0]?.value ||
        '';
      const zhCity =
        area?.areaName?.[0]?.value || name;
      setData({
        city: zhCity,
        tempC: cur.temp_C,
        feelsLikeC: cur.FeelsLikeC,
        description: zhDesc,
        humidity: cur.humidity,
        windSpeedKmph: cur.windspeedKmph,
        windDir: cur.winddir16Point,
        updatedAt: new Date().toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    } catch (e: any) {
      setError(e?.message || '获取天气失败');
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

  return (
    <div className="rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white p-5 shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sky-100">
            <HiOutlineMapPin className="h-4 w-4 flex-shrink-0" />
            {editing ? (
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onBlur={commit}
                onKeyDown={onKeyDown}
                placeholder="输入城市，如：北京 / Tokyo"
                className="bg-white/20 placeholder-white/60 text-white text-sm rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-white/60 w-40"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setInputValue(city);
                  setEditing(true);
                }}
                className="group inline-flex items-center gap-1 text-sm hover:text-white"
                title="点击更换城市"
              >
                <span className="font-medium">{data?.city || city}</span>
                <HiOutlinePencil className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" />
              </button>
            )}
          </div>

          <div className="mt-3 flex items-end gap-3">
            <div className="text-5xl leading-none">
              {data ? weatherEmoji(data.description) : '🌡️'}
            </div>
            <div>
              <div className="text-4xl font-bold leading-none">
                {loading ? '…' : data ? `${data.tempC}°` : '--'}
              </div>
              <div className="mt-1 text-sm text-sky-100">
                {loading
                  ? '加载中...'
                  : error
                  ? error
                  : data?.description || '—'}
              </div>
            </div>
          </div>

          {data && !loading && !error && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-sky-100">
              <div>
                <div className="opacity-70">体感</div>
                <div className="font-medium text-white">{data.feelsLikeC}°C</div>
              </div>
              <div>
                <div className="opacity-70">湿度</div>
                <div className="font-medium text-white">{data.humidity}%</div>
              </div>
              <div>
                <div className="opacity-70">风速</div>
                <div className="font-medium text-white">
                  {data.windSpeedKmph} km/h
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => fetchWeather(city)}
          className="rounded-lg p-2 bg-white/10 hover:bg-white/20 transition"
          title="刷新"
          disabled={loading}
        >
          <HiOutlineArrowPath
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {data?.updatedAt && !loading && !error && (
        <div className="mt-3 text-[11px] text-sky-100/80 text-right">
          更新于 {data.updatedAt}
        </div>
      )}
    </div>
  );
}
