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
  /**
   * 所有可用的兑人民币汇率，键名形如 "USD_CNY" / "EUR_CNY" / "JPY_CNY"。
   * 字段是动态的——前端按用户偏好挑 2~3 个显示。
   * 旧字段 USD_CNY / EUR_CNY / EUR_USD 永远存在，兼容老前端。
   */
  rates: Record<string, number> & {
    USD_CNY: number;
    EUR_CNY: number;
    EUR_USD: number;
  };
  /** 可供前端编辑器选择的全部货币代码列表（同时返回简短中文名）。 */
  available?: Array<{ code: string; nameZh: string }>;
}

// 拉哪些币种。code 用 ISO 4217，boc 是中行牌价表里的中文名（必须一字不差）。
// 顺序代表"用户编辑器里候选列表的展示顺序"——常用 G10 + 主要新兴市场。
// 中行偶尔会拿不到部分小币种数据，extractBocRow 失败时该币种就跳过，
// 不影响其它已抓到的。
const CURRENCIES = [
  // G10 / 主要发达市场
  { code: 'USD', boc: '美元', nameZh: '美元' },
  { code: 'EUR', boc: '欧元', nameZh: '欧元' },
  { code: 'GBP', boc: '英镑', nameZh: '英镑' },
  { code: 'JPY', boc: '日元', nameZh: '日元' },
  { code: 'HKD', boc: '港币', nameZh: '港币' },
  { code: 'AUD', boc: '澳大利亚元', nameZh: '澳元' },
  { code: 'CAD', boc: '加拿大元', nameZh: '加元' },
  { code: 'CHF', boc: '瑞士法郎', nameZh: '瑞郎' },
  { code: 'NZD', boc: '新西兰元', nameZh: '新西兰元' },
  { code: 'SGD', boc: '新加坡元', nameZh: '新加坡元' },
  { code: 'SEK', boc: '瑞典克朗', nameZh: '瑞典克朗' },
  { code: 'NOK', boc: '挪威克朗', nameZh: '挪威克朗' },
  { code: 'DKK', boc: '丹麦克朗', nameZh: '丹麦克朗' },
  // 亚太
  { code: 'KRW', boc: '韩国元', nameZh: '韩元' },
  { code: 'TWD', boc: '新台币', nameZh: '新台币' },
  { code: 'THB', boc: '泰国铢', nameZh: '泰铢' },
  { code: 'MYR', boc: '林吉特', nameZh: '马来西亚林吉特' },
  { code: 'PHP', boc: '菲律宾比索', nameZh: '菲律宾比索' },
  { code: 'IDR', boc: '印尼卢比', nameZh: '印尼卢比' },
  { code: 'VND', boc: '越南盾', nameZh: '越南盾' },
  { code: 'INR', boc: '印度卢比', nameZh: '印度卢比' },
  { code: 'PKR', boc: '巴基斯坦卢比', nameZh: '巴基斯坦卢比' },
  // 中东 / 非洲
  { code: 'AED', boc: '阿联酋迪拉姆', nameZh: '阿联酋迪拉姆' },
  { code: 'SAR', boc: '沙特里亚尔', nameZh: '沙特里亚尔' },
  { code: 'ZAR', boc: '南非兰特', nameZh: '南非兰特' },
  { code: 'EGP', boc: '埃及镑', nameZh: '埃及镑' },
  { code: 'TRY', boc: '土耳其里拉', nameZh: '土耳其里拉' },
  // 拉美
  { code: 'BRL', boc: '巴西里亚尔', nameZh: '巴西里亚尔' },
  { code: 'MXN', boc: '墨西哥比索', nameZh: '墨西哥比索' },
  // 东欧 / 俄
  { code: 'RUB', boc: '卢布', nameZh: '俄罗斯卢布' },
  { code: 'PLN', boc: '波兰兹罗提', nameZh: '波兰兹罗提' },
  { code: 'HUF', boc: '匈牙利福林', nameZh: '匈牙利福林' },
];

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
      base: 'CNY',
      source: 'loading',
      updatedAt: new Date().toISOString(),
      rates: { USD_CNY: 0, EUR_CNY: 0, EUR_USD: 0 },
      available: CURRENCIES.map(({ code, nameZh }) => ({ code, nameZh })),
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

    // 把所有候选币种都拉一遍。USD / EUR 必须成功，其它币种没解析到就跳过，
    // 不影响整体结果（中行偶尔会少几列数据）。
    const rates: Record<string, number> = {};
    for (const { code, boc } of CURRENCIES) {
      const per100 = this.extractBocRow(html, boc);
      if (per100 && per100 > 0) {
        rates[`${code}_CNY`] = Number((per100 / 100).toFixed(4));
      }
    }

    if (!rates.USD_CNY || !rates.EUR_CNY) {
      throw new Error('boc parse: USD/EUR row not found');
    }
    // EUR_USD 旧字段：保留兼容；通过 EUR_CNY / USD_CNY 推导
    rates.EUR_USD = Number((rates.EUR_CNY / rates.USD_CNY).toFixed(4));

    return {
      base: 'CNY',
      source: 'BOC',
      updatedAt: new Date(now).toISOString(),
      rates: rates as RatesPayload['rates'],
      available: CURRENCIES.map(({ code, nameZh }) => ({ code, nameZh })),
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
