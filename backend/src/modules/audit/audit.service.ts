import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Fields the caller typically provides to `log()`. `userId` + request
 * metadata can be supplied explicitly or inferred from a Request object.
 */
export interface WriteAuditLogInput {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  status?: 'SUCCESS' | 'FAILURE';
  errorMessage?: string | null;
  metadata?: Record<string, any> | null;

  // Identity (optional — `fromRequest` fills these)
  userId?: string | null;
  userEmail?: string | null;
  userName?: string | null;
  userRole?: string | null;

  // Request context (optional — `fromRequest` fills these)
  method?: string | null;
  path?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface QueryAuditLogInput {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  status?: string;
  from?: string | Date;
  to?: string | Date;
  search?: string;
}

/**
 * Central audit-log writer.
 *
 * Deliberately permissive about failures: a logging failure must never
 * break the business request. We catch + warn instead of rethrowing.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Record a single audit event (fire-and-forget). */
  async log(input: WriteAuditLogInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: input.action,
          status: input.status || 'SUCCESS',
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          targetLabel: input.targetLabel ?? null,
          errorMessage: input.errorMessage ?? null,
          metadata: (input.metadata as any) ?? undefined,
          userId: input.userId ?? null,
          userEmail: input.userEmail ?? null,
          userName: input.userName ?? null,
          userRole: input.userRole ?? null,
          method: input.method ?? null,
          path: input.path ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Audit write failed for action=${input.action}: ${err?.message || err}`,
      );
    }
  }

  /**
   * Convenience wrapper: pulls user + IP + UA out of a Nest Request and
   * writes an audit row. Safe to call even if `req.user` is missing.
   */
  async logFromRequest(
    req: Request & { user?: any },
    input: Omit<
      WriteAuditLogInput,
      'userId' | 'userEmail' | 'userName' | 'userRole' | 'method' | 'path' | 'ip' | 'userAgent'
    >,
  ): Promise<void> {
    const u = req?.user;
    return this.log({
      ...input,
      userId: u?.id ?? null,
      userEmail: u?.email ?? null,
      userName: u?.name ?? null,
      userRole: u?.role ?? null,
      method: req?.method ?? null,
      path: req?.originalUrl || req?.url || null,
      ip: AuditService.extractIp(req),
      userAgent:
        (req?.headers?.['user-agent'] as string | undefined)?.slice(0, 500) ?? null,
    });
  }

  static extractIp(req: any): string | null {
    if (!req) return null;
    const xf = req.headers?.['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0) {
      return xf.split(',')[0].trim();
    }
    if (Array.isArray(xf) && xf.length > 0) {
      return xf[0];
    }
    return (req.ip as string | undefined) || req.socket?.remoteAddress || null;
  }

  async query(q: QueryAuditLogInput) {
    const page = Math.max(1, q.page || 1);
    const pageSize = Math.min(200, Math.max(1, q.pageSize || 50));
    const where: any = {};
    if (q.userId) where.userId = q.userId;
    if (q.action) where.action = q.action;
    if (q.targetType) where.targetType = q.targetType;
    if (q.targetId) where.targetId = q.targetId;
    if (q.status) where.status = q.status;
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.search) {
      where.OR = [
        { userEmail: { contains: q.search, mode: 'insensitive' } },
        { userName: { contains: q.search, mode: 'insensitive' } },
        { action: { contains: q.search, mode: 'insensitive' } },
        { targetLabel: { contains: q.search, mode: 'insensitive' } },
        { targetId: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}
