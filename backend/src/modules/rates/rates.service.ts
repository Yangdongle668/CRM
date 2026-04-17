import { Injectable, Logger } from '@nestjs/common';

export interface RatesPayload {
  base: string;
  updatedAt: string;
  rates: { USD_CNY: number; EUR_CNY: number; EUR_USD: number };
}

@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);

  private cache: RatesPayload | null = null;
  private cacheTime = 0;
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  /** Returns current USD→CNY, EUR→CNY, EUR→USD rates. Cached 5 min. */
  async getRates(): Promise<RatesPayload> {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < this.TTL) {
      return this.cache;
    }

    try {
      // open.er-api.com is a free, keyless exchange-rate API (updates ~hourly)
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      const data: any = await res.json();
      const cny = data?.rates?.CNY;
      const eur = data?.rates?.EUR;
      if (typeof cny !== 'number' || typeof eur !== 'number') {
        throw new Error('invalid upstream payload');
      }

      const payload: RatesPayload = {
        base: 'USD',
        updatedAt: new Date(now).toISOString(),
        rates: {
          USD_CNY: Number(cny.toFixed(4)),
          EUR_CNY: Number((cny / eur).toFixed(4)), // cross rate
          EUR_USD: Number((1 / eur).toFixed(4)),
        },
      };

      this.cache = payload;
      this.cacheTime = now;
      return payload;
    } catch (err: any) {
      this.logger.warn(`Failed to fetch rates: ${err.message}. Returning cached or fallback.`);
      if (this.cache) return this.cache;
      // Last-resort fallback so the UI never breaks
      return {
        base: 'USD',
        updatedAt: new Date().toISOString(),
        rates: { USD_CNY: 0, EUR_CNY: 0, EUR_USD: 0 },
      };
    }
  }
}
