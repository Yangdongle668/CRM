import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type SearchType = 'customer' | 'lead' | 'order' | 'email';

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  meta?: Record<string, any>;
}

export interface SearchGroup {
  type: SearchType;
  hits: SearchHit[];
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async globalSearch(
    rawQuery: string,
    user: { id: string; role: string },
    options: { types?: SearchType[]; limit?: number } = {},
  ): Promise<SearchGroup[]> {
    const q = (rawQuery || '').trim();
    if (q.length < 1) return [];

    const types: SearchType[] = options.types?.length
      ? options.types
      : ['customer', 'lead', 'order', 'email'];
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
    const restrictToOwner = user.role === 'SALESPERSON';

    const tasks: Array<Promise<SearchGroup | null>> = [];
    if (types.includes('customer'))
      tasks.push(this.searchCustomers(q, user.id, restrictToOwner, limit));
    if (types.includes('lead'))
      tasks.push(this.searchLeads(q, user.id, restrictToOwner, limit));
    if (types.includes('order'))
      tasks.push(this.searchOrders(q, user.id, restrictToOwner, limit));
    if (types.includes('email'))
      tasks.push(this.searchEmails(q, user.id, restrictToOwner, limit));

    const results = await Promise.all(tasks);
    return results.filter((r): r is SearchGroup => r !== null && r.hits.length > 0);
  }

  private async searchCustomers(
    q: string,
    userId: string,
    restrictToOwner: boolean,
    limit: number,
  ): Promise<SearchGroup> {
    const rows = await this.prisma.customer.findMany({
      where: {
        ...(restrictToOwner ? { ownerId: userId } : {}),
        OR: [
          { companyName: { contains: q, mode: 'insensitive' } },
          { country: { contains: q, mode: 'insensitive' } },
          { website: { contains: q, mode: 'insensitive' } },
          { remark: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        companyName: true,
        country: true,
        status: true,
        website: true,
        remark: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return {
      type: 'customer',
      hits: rows.map((c) => ({
        id: c.id,
        title: c.companyName,
        subtitle: [c.country, c.website].filter(Boolean).join(' · '),
        snippet: this.buildSnippet(q, c.remark || ''),
        meta: { status: c.status },
      })),
    };
  }

  private async searchLeads(
    q: string,
    userId: string,
    restrictToOwner: boolean,
    limit: number,
  ): Promise<SearchGroup> {
    const scope = restrictToOwner
      ? { OR: [{ ownerId: userId }, { isPublicPool: true }] }
      : {};

    const rows = await this.prisma.lead.findMany({
      where: {
        ...scope,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { companyName: { contains: q, mode: 'insensitive' } },
          { contactName: { contains: q, mode: 'insensitive' } },
          { contactEmail: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { notes: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        title: true,
        companyName: true,
        contactName: true,
        contactEmail: true,
        stage: true,
        description: true,
        notes: true,
        isPublicPool: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return {
      type: 'lead',
      hits: rows.map((l) => ({
        id: l.id,
        title: l.title,
        subtitle: [l.companyName, l.contactName].filter(Boolean).join(' · '),
        snippet: this.buildSnippet(q, l.notes || l.description || ''),
        meta: { stage: l.stage, public: l.isPublicPool },
      })),
    };
  }

  private async searchOrders(
    q: string,
    userId: string,
    restrictToOwner: boolean,
    limit: number,
  ): Promise<SearchGroup> {
    const rows = await this.prisma.order.findMany({
      where: {
        ...(restrictToOwner ? { ownerId: userId } : {}),
        OR: [
          { orderNo: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } },
          { trackingNo: { contains: q, mode: 'insensitive' } },
          { remark: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        orderNo: true,
        title: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        currency: true,
        trackingNo: true,
        remark: true,
        updatedAt: true,
        customer: { select: { companyName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return {
      type: 'order',
      hits: rows.map((o) => ({
        id: o.id,
        title: `${o.orderNo} · ${o.title}`,
        subtitle: [o.customer?.companyName, `${o.currency} ${o.totalAmount}`]
          .filter(Boolean)
          .join(' · '),
        snippet: this.buildSnippet(q, o.remark || o.trackingNo || ''),
        meta: { status: o.status, paymentStatus: o.paymentStatus },
      })),
    };
  }

  private async searchEmails(
    q: string,
    userId: string,
    restrictToOwner: boolean,
    limit: number,
  ): Promise<SearchGroup> {
    const rows = await this.prisma.email.findMany({
      where: {
        ...(restrictToOwner ? { senderId: userId } : {}),
        OR: [
          { subject: { contains: q, mode: 'insensitive' } },
          { fromAddr: { contains: q, mode: 'insensitive' } },
          { toAddr: { contains: q, mode: 'insensitive' } },
          { bodyText: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        subject: true,
        fromAddr: true,
        toAddr: true,
        direction: true,
        sentAt: true,
        receivedAt: true,
        bodyText: true,
        customerId: true,
      },
      orderBy: [{ sentAt: 'desc' }, { receivedAt: 'desc' }],
      take: limit,
    });

    return {
      type: 'email',
      hits: rows.map((e) => ({
        id: e.id,
        title: e.subject || '(无主题)',
        subtitle:
          e.direction === 'OUTBOUND'
            ? `发给 ${e.toAddr}`
            : `来自 ${e.fromAddr}`,
        snippet: this.buildSnippet(q, e.bodyText || ''),
        meta: {
          direction: e.direction,
          customerId: e.customerId,
          at: e.sentAt || e.receivedAt,
        },
      })),
    };
  }

  /**
   * 在文本中查找关键词，返回前后 60 字符的上下文片段。
   * 关键词用特殊标记 {{MARK}}...{{/MARK}} 包裹，供前端替换为 <mark>。
   */
  private buildSnippet(query: string, text: string): string {
    if (!text) return '';
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const idx = lower.indexOf(q);
    if (idx < 0) {
      return text.length > 120 ? text.slice(0, 120) + '…' : text;
    }
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, idx + q.length + 60);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    const before = text.slice(start, idx);
    const hit = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length, end);
    return `${prefix}${before}{{MARK}}${hit}{{/MARK}}${after}${suffix}`;
  }
}
