import { Injectable, Logger } from '@nestjs/common';

export interface RatesPayload {
  base: string;
  source: string;
  updatedAt: string;
  rates: { USD_CNY: number; EUR_CNY: number; EUR_USD: number };
}

/**
 * Primary: 中国银行外汇牌价 (https://www.boc.cn/sourcedb/whpj/).
 *
 * 为什么用中行：
 * - 国内官方数据，银行实际换汇参考；
 * - 无需 API Key、无次数封顶、国内访问稳定；
 * - 使用"现汇卖出价"：银行卖出外汇给客户时执行的价格，
 *   也就是把人民币换成美元/欧元时客户真实承担的汇率。
 *
 * Fallback: open.er-api.com (keyless, ~hourly).
 */
@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);

  private cache: RatesPayload | null = null;
  private cacheTime = 0;
  // 中行无次数封顶；牌价本身一天内会多次更新（交易时段每几分钟），
  // 15 分钟缓存足够新鲜，也避免频繁抓取中行页面。
  private readonly TTL = 15 * 60 * 1000;

  async getRates(): Promise<RatesPayload> {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < this.TTL) {
      return this.cache;
    }

    // 1) 主：中国银行外汇牌价
    try {
      const payload = await this.fetchBocRates(now);
      this.cache = payload;
      this.cacheTime = now;
      return payload;
    } catch (err: any) {
      this.logger.warn(`BOC rates failed: ${err.message}. Trying fallback.`);
    }

    // 2) 备：open.er-api.com
    try {
      const payload = await this.fetchFallbackRates(now);
      this.cache = payload;
      this.cacheTime = now;
      return payload;
    } catch (err: any) {
      this.logger.warn(`Fallback rates failed: ${err.message}.`);
    }

    // 3) 最后兜底：上次缓存或 0 值，保证 UI 不崩
    if (this.cache) return this.cache;
    return {
      base: 'USD',
      source: 'none',
      updatedAt: new Date(now).toISOString(),
      rates: { USD_CNY: 0, EUR_CNY: 0, EUR_USD: 0 },
    };
  }

  /**
   * 抓取中国银行外汇牌价页面并解析"中行折算价"。
   * 中行牌价展示的是 100 单位外币兑换人民币的金额，需除以 100。
   */
  private async fetchBocRates(now: number): Promise<RatesPayload> {
    const res = await fetch('https://www.boc.cn/sourcedb/whpj/', {
      headers: {
        // 某些情况下中行会根据 UA 返回不同编码/布局
        'User-Agent':
          'Mozilla/5.0 (compatible; TradeCRM/1.0; +https://example.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`boc http ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    // 中行页面目前是 UTF-8；若未来切回 GBK，TextDecoder('gbk') 在 Node 18+ 可用。
    let html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (!html.includes('美元')) {
      try {
        html = new TextDecoder('gbk' as any, { fatal: false }).decode(buf);
      } catch {
        // ignore: 解码失败会在下方抛错
      }
    }

    const usdPer100 = this.extractBocRow(html, '美元');
    const eurPer100 = this.extractBocRow(html, '欧元');
    if (!usdPer100 || !eurPer100) {
      throw new Error('boc parse: USD/EUR row not found');
    }
    const usdCny = usdPer100 / 100;
    const eurCny = eurPer100 / 100;

    return {
      base: 'USD',
      source: 'BOC',
      updatedAt: new Date(now).toISOString(),
      rates: {
        USD_CNY: Number(usdCny.toFixed(4)),
        EUR_CNY: Number(eurCny.toFixed(4)),
        EUR_USD: Number((eurCny / usdCny).toFixed(4)),
      },
    };
  }

  /**
   * 中行牌价表格某一行的列顺序：
   * 货币名称 | 现汇买入价 | 现钞买入价 | 现汇卖出价 | 现钞卖出价 | 中行折算价 | 发布时间
   * 返回"现汇卖出价"（索引 2，去掉名称列后）—— 银行向客户卖出外汇的价格，
   * 是从人民币换成美元/欧元时客户实际承担的汇率。
   */
  private extractBocRow(html: string, currency: string): number | null {
    const rowRe = new RegExp(
      `<tr[^>]*>\\s*<td[^>]*>\\s*${currency}\\s*</td>([\\s\\S]*?)</tr>`,
      'i',
    );
    const m = html.match(rowRe);
    if (!m) return null;
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) =>
      c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim(),
    );
    const sellPrice = parseFloat(cells[2]);
    return Number.isFinite(sellPrice) && sellPrice > 0 ? sellPrice : null;
  }

  private async fetchFallbackRates(now: number): Promise<RatesPayload> {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) throw new Error(`er-api http ${res.status}`);
    const data: any = await res.json();
    const cny = data?.rates?.CNY;
    const eur = data?.rates?.EUR;
    if (typeof cny !== 'number' || typeof eur !== 'number') {
      throw new Error('er-api invalid payload');
    }
    return {
      base: 'USD',
      source: 'open.er-api.com',
      updatedAt: new Date(now).toISOString(),
      rates: {
        USD_CNY: Number(cny.toFixed(4)),
        EUR_CNY: Number((cny / eur).toFixed(4)),
        EUR_USD: Number((1 / eur).toFixed(4)),
      },
    };
  }
}
