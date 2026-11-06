import { BadRequestException, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const EMAIL_AI_SETTING = 'email_ai_provider';
const DEEPSEEK_URL = 'https://api.deepseek.com';
const DEEPSEEK_MODEL = 'deepseek-flash';

type StoredSettings = {
  baseUrl: string;
  model: string;
  autoAnalyze: boolean;
  encryptedKey?: string;
};

@Injectable()
export class EmailAiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async stored(): Promise<StoredSettings | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: EMAIL_AI_SETTING } });
    return row ? JSON.parse(row.value) : null;
  }

  private legacy() {
    return {
      baseUrl: DEEPSEEK_URL,
      model: process.env.DEEPSEEK_MODEL || DEEPSEEK_MODEL,
      autoAnalyze: process.env.DEEPSEEK_AUTO_ANALYZE === 'true',
    };
  }

  async view() {
    const row = await this.stored();
    const { baseUrl, model, autoAnalyze } = row ?? this.legacy();
    return { baseUrl, model, autoAnalyze, hasKey: !!(row ? row.encryptedKey : process.env.DEEPSEEK_API_KEY) };
  }

  private encryptionKey() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'change-this-jwt-secret-in-production') {
      throw new BadRequestException('请先配置正式的 JWT_SECRET，再保存 API Key');
    }
    return createHash('sha256').update('crm/email-ai/v1:').update(secret).digest();
  }

  async runtime() {
    const row = await this.stored();
    if (!row) return { ...this.legacy(), apiKey: process.env.DEEPSEEK_API_KEY };
    if (!row.encryptedKey) return row;
    const [iv, tag, data] = row.encryptedKey.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return { ...row, apiKey: Buffer.concat([decipher.update(data), decipher.final()]).toString() };
  }

  async save(input: { baseUrl?: string; model?: string; apiKey?: string; autoAnalyze?: boolean; clearKey?: boolean }) {
    if (typeof input?.baseUrl !== 'string' || typeof input.model !== 'string' ||
        typeof input.autoAnalyze !== 'boolean' ||
        (input.apiKey !== undefined && typeof input.apiKey !== 'string')) {
      throw new BadRequestException('邮件 AI 配置格式无效');
    }
    let url: URL;
    try {
      url = new URL(input.baseUrl.trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      throw new BadRequestException('请填写不含凭据和查询参数的 HTTPS API 基础地址');
    }
    const baseUrl = url.href.replace(/\/+$/, '');
    const model = input.model.trim();
    const apiKey = input.apiKey?.trim();
    if (!model || model.length > 200 || baseUrl.length > 1000 || (apiKey && apiKey.length > 4096)) {
      throw new BadRequestException('API 地址、模型或密钥长度无效');
    }
    const existing = await this.stored();
    let encryptedKey = existing?.encryptedKey;
    if (input.clearKey === true) {
      encryptedKey = undefined;
    } else {
      const previousUrl = existing?.baseUrl ?? DEEPSEEK_URL;
      if (baseUrl !== previousUrl && !apiKey) {
        throw new BadRequestException('修改 API 地址时，请填写新地址对应的 API Key');
      }
      const key = apiKey || (!existing && process.env.DEEPSEEK_API_KEY);
      if (key) {
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
        const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
        encryptedKey = [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
      }
    }
    if (input.autoAnalyze && !encryptedKey) throw new BadRequestException('开启自动分析前请设置 API Key');
    const value = JSON.stringify({ baseUrl, model, autoAnalyze: input.autoAnalyze, encryptedKey });
    await this.prisma.systemSetting.upsert({
      where: { key: EMAIL_AI_SETTING }, create: { key: EMAIL_AI_SETTING, value }, update: { value },
    });
    return { baseUrl, model, autoAnalyze: input.autoAnalyze, hasKey: !!encryptedKey };
  }
}
