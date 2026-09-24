/**
 * 翻译服务商接口。输入一批纯文本段落，按相同顺序返回译文和检测到的
 * 源语言。换 DeepL / 大模型时实现这个接口即可。
 */
export interface TranslateProvider {
  translate(
    texts: string[],
    target: string,
  ): Promise<Array<{ text: string; sourceLang?: string }>>;
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

/**
 * 谷歌翻译（免 key 的 gtx 接口）。
 *
 * 用 translate_a/t + POST + 多个 q 参数：每段单独返回
 * [[译文, 源语言], ...]，天然按段对齐，不需要拼分隔符再拆。
 * 旧实现用 GET 把全文塞进 URL，非拉丁文字的长邮件 URL 超长直接 400。
 */
export class GoogleTranslateProvider implements TranslateProvider {
  private readonly endpoint = 'https://translate.googleapis.com/translate_a/t';

  async translate(texts: string[], target: string) {
    const body = new URLSearchParams();
    for (const t of texts) body.append('q', t);
    const url =
      this.endpoint +
      '?' +
      new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target }).toString();

    const data = await this.postWithRetry(url, body.toString());
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new Error(
        `unexpected response shape (got ${Array.isArray(data) ? data.length : typeof data} items for ${texts.length})`,
      );
    }
    return data.map((item: any) => {
      // sl=auto 时每项是 [译文, 源语言]；兼容直接返回字符串的情况。
      if (Array.isArray(item)) {
        return {
          text: typeof item[0] === 'string' ? item[0] : '',
          sourceLang: typeof item[1] === 'string' ? item[1] : undefined,
        };
      }
      return { text: typeof item === 'string' ? item : '' };
    });
  }

  private async postWithRetry(url: string, body: string): Promise<any> {
    let lastErr: any;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) return await res.json();
        lastErr = new Error(`upstream HTTP ${res.status}`);
        // 只有限流和服务端错误值得重试，4xx 直接放弃。
        if (res.status !== 429 && res.status < 500) break;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }
}
