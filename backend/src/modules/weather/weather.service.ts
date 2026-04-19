import { Injectable, Logger } from '@nestjs/common';

export interface WeatherPayload {
  city: string;
  temp: string;
  description: string;
  source: string;
  updatedAt: string;
}

interface Provider {
  name: string;
  fetch: (city: string) => Promise<Omit<WeatherPayload, 'source' | 'updatedAt'>>;
}

/**
 * 天气服务：多数据源轮询。
 * - 前端统一调用 /api/weather?city=X，彻底避免浏览器端 CORS 导致的
 *   "Failed to fetch" 问题。
 * - 按顺序尝试多个免 key 的公开数据源，拿到第一个成功返回即用；
 *   全部失败才抛错。
 * - 按城市做 10 分钟内存缓存，降低对上游压力。
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, { at: number; data: WeatherPayload }>();
  private readonly TTL = 10 * 60 * 1000;
  private readonly UPSTREAM_TIMEOUT = 5000;

  private readonly providers: Provider[] = [
    { name: 'vvhan', fetch: (c) => this.fromVvhan(c) },
    { name: 'yiketianqi', fetch: (c) => this.fromYiketianqi(c) },
    { name: 'wttr.in', fetch: (c) => this.fromWttr(c) },
  ];

  async getWeather(rawCity: string): Promise<WeatherPayload> {
    const city = (rawCity || '').trim() || '东莞';
    const now = Date.now();
    const cached = this.cache.get(city);
    if (cached && now - cached.at < this.TTL) {
      return cached.data;
    }

    const errors: string[] = [];
    for (const p of this.providers) {
      try {
        const partial = await p.fetch(city);
        const payload: WeatherPayload = {
          ...partial,
          source: p.name,
          updatedAt: new Date(now).toISOString(),
        };
        this.cache.set(city, { at: now, data: payload });
        return payload;
      } catch (err: any) {
        errors.push(`${p.name}: ${err?.message || 'error'}`);
      }
    }

    this.logger.warn(`All weather providers failed for "${city}": ${errors.join(' | ')}`);
    if (cached) return cached.data;
    throw new Error(`天气获取失败（${errors.length} 个数据源均不可用）`);
  }

  // ---- providers -----------------------------------------------------------

  // 1) 韩小韩 API — 国内免 key 聚合
  private async fromVvhan(city: string) {
    const url = `https://api.vvhan.com/api/weather?city=${encodeURIComponent(city)}`;
    const json = await this.fetchJson(url);
    if (json?.success === false) throw new Error(json?.message || 'vvhan failed');
    const info = json?.data || json?.info || json;
    const temp = info?.tem ?? info?.temperature ?? info?.temp;
    const wea = info?.wea ?? info?.type ?? info?.weather;
    if (temp == null || wea == null) throw new Error('missing fields');
    return {
      city: String(json?.city || info?.city || city).replace(/市$/, ''),
      temp: String(temp).replace(/[^\d.\-]/g, '') || String(temp),
      description: String(wea),
    };
  }

  // 2) 易客天气 v61 — 国内免 key（官方 demo appid/secret 公开可用）
  private async fromYiketianqi(city: string) {
    const url =
      `https://v0.yiketianqi.com/api?unescape=1&version=v61` +
      `&appid=43656176&appsecret=I42og6Lm` +
      `&city=${encodeURIComponent(city)}`;
    const json = await this.fetchJson(url);
    const temp = json?.tem;
    const wea = json?.wea;
    if (temp == null || wea == null) throw new Error('missing fields');
    return {
      city: String(json?.city || city).replace(/市$/, ''),
      temp: String(temp).replace(/[^\d.\-]/g, '') || String(temp),
      description: String(wea),
    };
  }

  // 3) wttr.in — 境外但非常稳定，支持中文城市名与 lang=zh 描述
  private async fromWttr(city: string) {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;
    const json = await this.fetchJson(url);
    const cur = json?.current_condition?.[0];
    const area = json?.nearest_area?.[0];
    if (!cur) throw new Error('missing current_condition');
    const desc =
      cur.lang_zh?.[0]?.value ||
      cur.weatherDesc?.[0]?.value ||
      '';
    return {
      city: String(area?.areaName?.[0]?.value || city),
      temp: String(cur.temp_C),
      description: desc,
    };
  }

  // ---- helpers -------------------------------------------------------------

  private async fetchJson(url: string): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.UPSTREAM_TIMEOUT);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TradeCRM/1.0)',
          Accept: 'application/json,text/plain,*/*',
        },
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('invalid json');
      }
    } finally {
      clearTimeout(timer);
    }
  }
}
