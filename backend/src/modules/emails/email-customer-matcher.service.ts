import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// 公共邮箱域名：不能拿来按官网域名匹配客户
const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'live.com', 'msn.com', 'aol.com', 'mail.com', 'icloud.com', 'me.com',
  'protonmail.com', 'proton.me', 'zoho.com', 'gmx.com', 'gmx.de', 'yandex.ru',
  'yandex.com', 'mail.ru', 'qq.com', 'foxmail.com', '163.com', '126.com',
  'sina.com', 'sohu.com', 'aliyun.com',
]);

// 官网域名 → 客户的映射缓存时长。新建客户最多 5 分钟后生效。
const DOMAIN_CACHE_TTL_MS = 5 * 60 * 1000;

function extractDomain(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#:]/)[0]
    .toLowerCase();
}

/**
 * 按邮箱地址匹配 CRM 客户：
 *   1. 联系人邮箱精确匹配（不区分大小写）；
 *   2. 发件域名 = 客户官网域名（或其子域名）。
 *
 * 以前第 2 步每封邮件都把所有带官网的客户查一遍，收信量一大就是成千
 * 上万次全表查询。现在把"域名 → 客户"映射缓存在内存里。
 */
@Injectable()
export class EmailCustomerMatcher {
  private domainMap: Map<string, string> | null = null; // domain -> customerId
  private domainMapLoadedAt = 0;
  private loading: Promise<Map<string, string>> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async match(emailAddress: string): Promise<{ id: string } | null> {
    const addr = (emailAddress || '').trim();
    if (!addr.includes('@')) return null;

    const contact = await this.prisma.contact.findFirst({
      where: { email: { equals: addr, mode: 'insensitive' } },
      select: { customerId: true },
    });
    if (contact?.customerId) return { id: contact.customerId };

    const domain = addr.split('@')[1]?.toLowerCase();
    if (!domain || FREE_MAIL_DOMAINS.has(domain)) return null;

    const map = await this.getDomainMap();
    // 从完整域名逐级往上找：sales.acme.co.uk → acme.co.uk → co.uk
    const parts = domain.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      const id = map.get(parts.slice(i).join('.'));
      if (id) return { id };
    }
    return null;
  }

  /** 客户官网变更后可手动失效（目前靠 TTL 自然过期）。 */
  invalidate() {
    this.domainMap = null;
  }

  private async getDomainMap(): Promise<Map<string, string>> {
    const fresh =
      this.domainMap && Date.now() - this.domainMapLoadedAt < DOMAIN_CACHE_TTL_MS;
    if (fresh) return this.domainMap!;
    if (!this.loading) {
      this.loading = this.loadDomainMap().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async loadDomainMap(): Promise<Map<string, string>> {
    const customers = await this.prisma.customer.findMany({
      where: { OR: [{ website: { not: null } }, { website2: { not: null } }] },
      select: { id: true, website: true, website2: true },
      orderBy: { createdAt: 'asc' },
    });
    const map = new Map<string, string>();
    for (const c of customers) {
      for (const w of [c.website, c.website2]) {
        if (!w) continue;
        const d = extractDomain(w);
        // 同一域名多个客户时保留最早建档的，和以前"遍历命中第一个"一致
        if (d && d.includes('.') && !map.has(d)) map.set(d, c.id);
      }
    }
    this.domainMap = map;
    this.domainMapLoadedAt = Date.now();
    return map;
  }
}
