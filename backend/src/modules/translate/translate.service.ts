import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailActor, EmailsService } from '../emails/emails.service';
import {
  GoogleTranslateProvider,
  TranslateProvider,
} from './translate.provider';

export interface TranslateSegment {
  index: number;
  original: string;
  translated: string;
}

export interface TranslateResult {
  sourceLang: string;
  targetLang: string;
  segments: TranslateSegment[];
  /** 翻译失败、按原文返回的段落 index。前端据此提示"N 段未能翻译"。 */
  failed: number[];
  /** 是否命中译文缓存。 */
  cached: boolean;
}

// 分批：每批最多 50 段、5000 字符；最多 3 批并发。实测谷歌单次 POST
// 能吃下 100 段 / 20000 字符，这里留足余量，避免触发限流。
const BATCH_MAX_SEGMENTS = 50;
const BATCH_MAX_CHARS = 5000;
const CONCURRENCY = 3;

/**
 * 逐段翻译邮件正文。前端从邮件 HTML 里抽出文本节点（跳过图片 / 引用
 * 历史等），按 index 发过来；这里按 index 原样返回译文，前端就地替换。
 *
 * 翻译服务商走 TranslateProvider 接口，默认谷歌。以后写信时"中文转
 * 外文"等功能复用同一个接口。
 */
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);
  private readonly provider: TranslateProvider = new GoogleTranslateProvider();

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
  ) {}

  async translateSegments(
    segments: { index: number; text: string }[],
    target = 'zh-CN',
    opts: { emailId?: string; actor?: EmailActor } = {},
  ): Promise<TranslateResult> {
    const valid = (segments || []).filter(
      (s) => s && typeof s.text === 'string' && s.text.trim().length > 0,
    );
    if (valid.length === 0) {
      throw new BadRequestException('没有可翻译的内容');
    }

    // 带了 emailId 就走缓存；先校验调用者能读这封邮件，防止借缓存读别人的译文。
    const emailId = opts.emailId && opts.actor ? opts.emailId : undefined;
    if (emailId) {
      await this.emails.ensureCanRead(emailId, opts.actor!);
    }
    const sourceHash = this.hashSegments(valid, target);

    if (emailId) {
      const hit = await this.prisma.emailTranslation.findUnique({
        where: { emailId_targetLang: { emailId, targetLang: target } },
      });
      if (hit && hit.sourceHash === sourceHash) {
        const cachedMap = new Map<number, string>(
          (hit.segments as any[]).map((s) => [s.index, s.translated]),
        );
        return {
          sourceLang: hit.sourceLang || 'auto',
          targetLang: target,
          segments: valid.map((s) => ({
            index: s.index,
            original: s.text,
            translated: cachedMap.get(s.index) ?? s.text,
          })),
          failed: [],
          cached: true,
        };
      }
    }

    const batches = this.batchSegments(valid);
    const translated = new Map<number, string>();
    const failed: number[] = [];
    // 检测到的源语言按字符数加权投票，取最主要的一种。
    const langWeight = new Map<string, number>();

    await this.runWithConcurrency(batches, CONCURRENCY, async (batch) => {
      try {
        const out = await this.provider.translate(
          batch.map((s) => s.text.trim()),
          target,
        );
        batch.forEach((seg, i) => {
          const r = out[i];
          if (r && typeof r.text === 'string' && r.text.trim()) {
            translated.set(seg.index, r.text.trim());
            if (r.sourceLang) {
              langWeight.set(
                r.sourceLang,
                (langWeight.get(r.sourceLang) || 0) + seg.text.length,
              );
            }
          } else {
            failed.push(seg.index);
          }
        });
      } catch (err: any) {
        this.logger.warn(
          `translate batch of ${batch.length} failed: ${err?.message || err}`,
        );
        failed.push(...batch.map((s) => s.index));
      }
    });

    if (failed.length === valid.length) {
      throw new ServiceUnavailableException('翻译服务暂时不可用，请稍后重试');
    }

    let sourceLang = 'auto';
    let best = 0;
    for (const [lang, w] of langWeight) {
      if (w > best) {
        best = w;
        sourceLang = lang;
      }
    }

    const result: TranslateSegment[] = valid.map((s) => ({
      index: s.index,
      original: s.text,
      translated: translated.get(s.index) ?? s.text,
    }));

    // 只缓存完整成功的结果；部分失败的下次重新翻译。
    if (emailId && failed.length === 0) {
      const data = {
        sourceLang,
        sourceHash,
        segments: result.map((r) => ({ index: r.index, translated: r.translated })),
      };
      await this.prisma.emailTranslation
        .upsert({
          where: { emailId_targetLang: { emailId, targetLang: target } },
          create: { emailId, targetLang: target, ...data },
          update: data,
        })
        .catch((e) => this.logger.warn(`cache translation failed: ${e?.message}`));
    }

    return {
      sourceLang,
      targetLang: target,
      segments: result,
      failed: failed.sort((a, b) => a - b),
      cached: false,
    };
  }

  private hashSegments(
    segments: { index: number; text: string }[],
    target: string,
  ): string {
    const h = createHash('sha256');
    h.update(target);
    for (const s of segments) {
      h.update(`\u0000${s.index}\u0000${s.text}`);
    }
    return h.digest('hex');
  }

  private batchSegments(
    segments: { index: number; text: string }[],
  ): { index: number; text: string }[][] {
    const batches: { index: number; text: string }[][] = [];
    let current: { index: number; text: string }[] = [];
    let currentLen = 0;

    for (const seg of segments) {
      const len = seg.text.length;
      if (
        current.length > 0 &&
        (current.length >= BATCH_MAX_SEGMENTS || currentLen + len > BATCH_MAX_CHARS)
      ) {
        batches.push(current);
        current = [];
        currentLen = 0;
      }
      current.push(seg);
      currentLen += len;
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    });
    await Promise.all(runners);
  }
}
