import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

export interface RatesPayload {
  base: string;
  source: string;
  updatedAt: string;
  rates: { USD_CNY: number; EUR_CNY: number; EUR_USD: number };
}

/**
 * 汇率 —— 只用中国银行外汇牌价 (https://www.boc.cn/sourcedb/whpj/)。
 * 使用"现汇买入价"：外贸出口商把美元/欧元结算回人民币时银行执行的价格。
 *
 * 行为特点：后端**主动轮询**，不靠请求触发。
 *   - 启动后立即拉一次；
 *   - 成功 → 把结果缓存起来，15 分钟后再拉下一次；
 *   - 失败 → 30s、1m、2m、4m、5m（上限）指数退避继续重试，
 *            直到拿到数据才进入 15 分钟刷新周期。
 *   - GET /api/rates 只读内存缓存，不阻塞等上游。
 */
@Injectable()
export class RatesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RatesService.name);

  private readonly SUCCESS_INTERVAL = 15 * 60 * 1000; // 15 分钟
  private readonly BACKOFF_MS = [30_000, 60_000, 120_000, 240_000, 300_000];

  private cache: RatesPayload | null = null;
  private consecutiveFailures = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  onModuleInit() {
    // 启动后立刻拉一次；不 await，避免卡住 Nest 启动。
    void this.runPoll();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** API 层：只返回内存缓存或占位值，不发网络。 */
  async getRates(): Promise<RatesPayload> {
    if (this.cache) return this.cache;
    // 还没拿到过 → 返回 0 占位；前端看到 USD_CNY=0 会自动隐藏汇率条。
    return {
      base: 'USD',
      source: 'loading',
      updatedAt: new Date().toISOString(),
      rates: { USD_CNY: 0, EUR_CNY: 0, EUR_USD: 0 },
    };
  }

  private scheduleNext(delayMs: number) {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.runPoll(), delayMs);
  }

  private async runPoll() {
    if (this.stopped) return;
    try {
      const payload = await this.fetchBocRates(Date.now());
      this.cache = payload;
      this.consecutiveFailures = 0;
      this.logger.log(
        `BOC rates updated: USD=${payload.rates.USD_CNY} EUR=${payload.rates.EUR_CNY}`,
      );
      this.scheduleNext(this.SUCCESS_INTERVAL);
    } catch (err: any) {
      const failIdx = Math.min(
        this.consecutiveFailures,
        this.BACKOFF_MS.length - 1,
      );
      const delay = this.BACKOFF_MS[failIdx];
      this.consecutiveFailures++;
      this.logger.warn(
        `BOC rates fetch failed (attempt ${this.consecutiveFailures}): ${err?.message}. Retrying in ${delay / 1000}s.`,
      );
      this.scheduleNext(delay);
    }
  }

  /**
   * 抓取中行页面并解析"现汇买入价"。
   * 中行牌价表格一行是 100 单位外币兑换人民币的金额，所以除以 100。
   */
  private async fetchBocRates(now: number): Promise<RatesPayload> {
    const res = await fetch('https://www.boc.cn/sourcedb/whpj/', {
      headers: {
        // 某些情况下中行根据 UA 返回不同编码/布局
        'User-Agent':
          'Mozilla/5.0 (compatible; TradeCRM/1.0; +https://example.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`boc http ${res.status}`);

    const buf = Buffer.from(await res.arrayBuffer());
    // 中行页面现在是 UTF-8；若未来切回 GBK，TextDecoder('gbk') 在 Node 18+ 可用。
    let html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    if (!html.includes('美元')) {
      try {
        html = new TextDecoder('gbk' as any, { fatal: false }).decode(buf);
      } catch {
        /* ignore, 下面解析会抛 */
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
   * 返回"现汇买入价"（索引 0，去掉名称列后）。
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
    const buyPrice = parseFloat(cells[0]);
    return Number.isFinite(buyPrice) && buyPrice > 0 ? buyPrice : null;
  }
}
