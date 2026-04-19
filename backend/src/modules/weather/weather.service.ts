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

// WMO 天气代码 → 中文描述 (Open-Meteo 使用)
const WMO_ZH: Record<number, string> = {
  0: '晴',
  1: '晴',
  2: '多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '小冻毛毛雨',
  57: '冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '强冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '米雪',
  80: '小阵雨',
  81: '中阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '强阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴冰雹',
  99: '强雷阵雨伴冰雹',
};

/**
 * 天气服务：多数据源轮询。
 *
 * 设计要点：
 * - 前端统一调用 /api/weather?city=X，彻底避免浏览器端 CORS。
 * - 上游数据源按可靠性排序，第一个成功返回就使用。
 * - 不用 wttr.in —— 它对中文地名 geocoding 经常错位、拿到的是别的
 *   同名小地方或海外城市，所以下线。
 * - Open-Meteo 作为兜底：它自家提供 geocoding API 支持 language=zh，
 *   中文地名 → 经纬度精度很高，再用经纬度拿天气，全球可靠。
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly cache = new Map<string, { at: number; data: WeatherPayload }>();
  private readonly TTL = 10 * 60 * 1000;
  private readonly UPSTREAM_TIMEOUT = 6000;

  private readonly providers: Provider[] = [
    { name: 'vvhan', fetch: (c) => this.fromVvhan(c) },
    { name: 'yiketianqi', fetch: (c) => this.fromYiketianqi(c) },
    { name: 'open-meteo', fetch: (c) => this.fromOpenMeteo(c) },
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
    if (json?.success === false) throw new Error(json?.message || 'failed');
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

  // 2) 易客天气 v61 — 国内免 key（官方 demo appid/secret）
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

  /**
   * 3) Open-Meteo: 两步调用，先中文地名 geocode 到经纬度，再按经纬度查天气。
   * - 全球覆盖、免 key、限流宽松；
   * - geocoding API 支持 language=zh，对"东莞/深圳/厦门"等中文地名解析非常准；
   * - 避免了 wttr.in 那种把"东莞"误识别成其它地方的问题。
   */
  private async fromOpenMeteo(city: string) {
    const geoUrl =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(city)}&language=zh&count=1&format=json`;
    const geo = await this.fetchJson(geoUrl);
    const hit = geo?.results?.[0];
    if (!hit?.latitude || !hit?.longitude) {
      throw new Error('geocode miss');
    }
    const lat = Number(hit.latitude).toFixed(3);
    const lon = Number(hit.longitude).toFixed(3);

    const wxUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code` +
      `&timezone=auto`;
    const wx = await this.fetchJson(wxUrl);
    const temp = wx?.current?.temperature_2m;
    const code = wx?.current?.weather_code;
    if (temp == null || code == null) throw new Error('weather missing');

    // 优先使用 geocoding 返回的中文名；否则用用户输入
    const resolvedCity =
      String(hit.name || city).replace(/市$/, '');
    return {
      city: resolvedCity,
      temp: String(Math.round(Number(temp))),
      description: WMO_ZH[Number(code)] || `代码${code}`,
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
