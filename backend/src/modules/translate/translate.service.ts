import { BadRequestException, Injectable, Logger } from '@nestjs/common';

export interface TranslateSegment {
  index: number;
  original: string;
  translated: string;
}

export interface TranslateResult {
  sourceLang: string;
  targetLang: string;
  segments: TranslateSegment[];
}

/**
 * TranslateService — takes an array of text segments (extracted from
 * email HTML by the frontend, skipping images/tags), translates each
 * via Google Translate's free endpoint, and returns translated segments
 * with matching indices so the frontend can replace them in-place.
 */
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);

  /**
   * Translate an array of text segments.
   * @param segments Array of { index, text } — text portions to translate
   * @param target   Target language code (default zh-CN)
   */
  async translateSegments(
    segments: { index: number; text: string }[],
    target = 'zh-CN',
  ): Promise<TranslateResult> {
    if (!segments || segments.length === 0) {
      throw new BadRequestException('没有可翻译的内容');
    }

    // Filter out empty/whitespace-only segments
    const valid = segments.filter((s) => s.text && s.text.trim().length > 0);
    if (valid.length === 0) {
      throw new BadRequestException('没有可翻译的内容');
    }

    // Batch segments into groups ≤ 4500 chars total to stay under the
    // free endpoint's limit, then translate each batch.
    const results: TranslateSegment[] = [];
    let detectedLang = 'auto';

    const batches = this.batchSegments(valid, 4500);
    for (const batch of batches) {
      // Join with a sentinel delimiter that won't appear in normal text
      const DELIM = '\n\u2063\n';
      const joined = batch.map((s) => s.text.trim()).join(DELIM);

      try {
        const { text, sourceLang } = await this.callGoogleTranslate(joined, target);
        if (detectedLang === 'auto' && sourceLang) detectedLang = sourceLang;

        const parts = text.split(/\n?\u2063\n?/);
        for (let i = 0; i < batch.length; i++) {
          results.push({
            index: batch[i].index,
            original: batch[i].text,
            translated: (parts[i] || batch[i].text).trim(),
          });
        }
      } catch (err: any) {
        this.logger.error(`translate batch failed: ${err?.message}`);
        // On failure, return originals so the UI doesn't break
        for (const seg of batch) {
          results.push({
            index: seg.index,
            original: seg.text,
            translated: seg.text,
          });
        }
      }
    }

    return {
      sourceLang: detectedLang,
      targetLang: target,
      segments: results,
    };
  }

  private async callGoogleTranslate(text: string, target: string) {
    const url =
      'https://translate.googleapis.com/translate_a/single?' +
      new URLSearchParams({
        client: 'gtx',
        sl: 'auto',
        tl: target,
        dt: 't',
        q: text,
      }).toString();

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; TradeCRM/1.0; +https://example.com)',
      },
    });

    if (!res.ok) {
      throw new Error(`upstream HTTP ${res.status}`);
    }

    const data: any = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('unexpected response shape');
    }

    const translated = data[0]
      .map((seg: any) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
      .join('');
    const sourceLang = typeof data[2] === 'string' ? data[2] : 'auto';
    return { text: translated, sourceLang };
  }

  private batchSegments(
    segments: { index: number; text: string }[],
    maxLen: number,
  ): { index: number; text: string }[][] {
    const batches: { index: number; text: string }[][] = [];
    let current: { index: number; text: string }[] = [];
    let currentLen = 0;

    for (const seg of segments) {
      if (currentLen + seg.text.length > maxLen && current.length > 0) {
        batches.push(current);
        current = [];
        currentLen = 0;
      }
      current.push(seg);
      currentLen += seg.text.length + 3; // +3 for delimiter
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }
}
