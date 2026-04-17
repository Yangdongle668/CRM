import { BadRequestException, Injectable, Logger } from '@nestjs/common';

export interface TranslateResult {
  sourceLang: string;
  targetLang: string;
  text: string;
}

/**
 * TranslateService — wraps Google Translate's free, key-less single
 * endpoint. It returns JSON (despite the HTML content type), auto-
 * detects the source language, and can translate up to ~5000 chars
 * per call. When the source already matches the target we short-
 * circuit and return the input unchanged.
 *
 * The endpoint is technically undocumented but widely used; if it ever
 * 429s we surface a clear error so the UI can inform the user.
 */
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name);

  async translate(raw: string, target = 'zh-CN'): Promise<TranslateResult> {
    const text = (raw || '').trim();
    if (!text) {
      throw new BadRequestException('Text is empty');
    }

    // Strip HTML tags so the translated output is clean text — the UI
    // renders it in a simple blockquote panel.
    const plain = text
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!plain) {
      throw new BadRequestException('Text is empty after stripping HTML');
    }

    // Google's free endpoint caps requests at ~5000 chars of source,
    // so split the plain text into chunks and concatenate translations.
    const chunks = this.splitIntoChunks(plain, 4500);
    const pieces: string[] = [];
    let detectedLang = 'auto';

    for (const chunk of chunks) {
      try {
        const { text, sourceLang } = await this.translateChunk(chunk, target);
        pieces.push(text);
        if (detectedLang === 'auto' && sourceLang) detectedLang = sourceLang;
      } catch (err: any) {
        this.logger.error(`translate chunk failed: ${err?.message}`);
        throw new BadRequestException(
          `翻译服务暂时不可用，请稍后重试${err?.message ? ` (${err.message})` : ''}`,
        );
      }
    }

    return {
      sourceLang: detectedLang,
      targetLang: target,
      text: pieces.join(''),
    };
  }

  private async translateChunk(chunk: string, target: string) {
    const url =
      'https://translate.googleapis.com/translate_a/single?' +
      new URLSearchParams({
        client: 'gtx',
        sl: 'auto',
        tl: target,
        dt: 't',
        q: chunk,
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
    // Response shape: [ [ [translated, original, ...], ... ], null, "en" ... ]
    if (!Array.isArray(data) || !Array.isArray(data[0])) {
      throw new Error('unexpected response shape');
    }

    const translated = data[0]
      .map((seg: any) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
      .join('');
    const sourceLang = typeof data[2] === 'string' ? data[2] : 'auto';
    return { text: translated, sourceLang };
  }

  /**
   * Split plain text into <= maxLen chunks, trying to break at paragraph
   * boundaries first, falling back to sentence boundaries, then hard cuts.
   */
  private splitIntoChunks(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;
    while (remaining.length > maxLen) {
      let cut = remaining.lastIndexOf('\n\n', maxLen);
      if (cut < maxLen / 2) cut = remaining.lastIndexOf('\n', maxLen);
      if (cut < maxLen / 2) cut = remaining.lastIndexOf('. ', maxLen);
      if (cut < maxLen / 2) cut = maxLen;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    if (remaining) chunks.push(remaining);
    return chunks;
  }
}
