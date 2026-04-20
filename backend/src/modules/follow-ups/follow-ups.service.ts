import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 线索阶段 → 下次跟进间隔（天）。null = 该阶段不建跟进。
 * 若未来想做成可配置，把这张表读出来写进 Settings 表即可，service
 * 所有调用点都走 getFollowUpDays() 这层抽象。
 */
const STAGE_FOLLOWUP_DAYS: Record<string, number | null> = {
  NEW: 1,
  CONTACTED: 3,
  QUALIFIED: 5,
  PROPOSAL: 7,
  NEGOTIATION: 2,
  CLOSED_WON: null,
  CLOSED_LOST: null,
};

const DEFAULT_DAYS = 3; // 万一碰到未知 stage 的兜底

export function getFollowUpDays(stage?: string | null): number | null {
  if (!stage) return DEFAULT_DAYS;
  if (!(stage in STAGE_FOLLOWUP_DAYS)) return DEFAULT_DAYS;
  return STAGE_FOLLOWUP_DAYS[stage];
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

// 把 "Name <addr@x.com>" / "addr@x.com" 里的地址抠出来并小写
function extractEmail(raw: string): string {
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

interface ListFilters {
  ownerId?: string;
  status?: 'PENDING' | 'DONE' | 'DISMISSED' | 'SNOOZED';
  overdueOnly?: boolean;
  leadId?: string;
}

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ==================== HOOKS (被 Email/Lead service 调用) ====================

  /**
   * 外发邮件成功后挂钩：
   *   - 若收件人地址匹配某条 Lead
   *   - 且该 Lead 有 ownerId（不是公共池）
   *   - 且当前没有 PENDING 跟进
   *   就按 Lead.stage 对应的间隔新建一条跟进；
   *   若已有 PENDING 跟进，则更新它的 triggerEmailId + dueAt 为"从今天起算"。
   */
  async createForOutboundEmail(email: {
    id: string;
    toAddr: string;
    customerId?: string | null;
    senderId?: string | null;
  }): Promise<void> {
    try {
      const addr = extractEmail(email.toAddr || '');
      if (!addr) return;

      // 找匹配的 Lead：优先主邮箱，其次对接人邮箱
      const lead = await this.prisma.lead.findFirst({
        where: {
          OR: [
            { email: { equals: addr, mode: 'insensitive' } },
            { contactEmail: { equals: addr, mode: 'insensitive' } },
          ],
        },
        select: { id: true, stage: true, ownerId: true, isPublicPool: true },
      });
      if (!lead) return;
      if (!lead.ownerId || lead.isPublicPool) return;

      const days = getFollowUpDays(lead.stage);
      if (days == null) return; // CLOSED_* 不建

      const dueAt = addDays(new Date(), days);

      const existing = await this.prisma.followUp.findFirst({
        where: { leadId: lead.id, status: 'PENDING' },
      });
      if (existing) {
        await this.prisma.followUp.update({
          where: { id: existing.id },
          data: {
            triggerEmailId: email.id,
            dueAt, // 从这次发送起重新计时
            reason: 'RENEWED',
          },
        });
        return;
      }

      await this.prisma.followUp.create({
        data: {
          leadId: lead.id,
          triggerEmailId: email.id,
          ownerId: lead.ownerId,
          dueAt,
          status: 'PENDING',
          reason: 'FIRST_OUTREACH',
        },
      });
    } catch (err: any) {
      // 跟进是副作用，出错不能影响发邮件主流程
      this.logger.warn(
        `Failed to create follow-up for email ${email.id}: ${err?.message}`,
      );
    }
  }

  /**
   * 收到入邮件后挂钩：如果这封 INBOUND 邮件的 In-Reply-To / References
   * 命中某条 PENDING 跟进的 triggerEmail，就把该跟进打 DONE。
   */
  async resolveOnInboundEmail(opts: {
    inReplyTo?: string | null;
    references?: string | string[] | null;
    fromAddr?: string;
  }): Promise<void> {
    try {
      const ids: string[] = [];
      if (opts.inReplyTo) ids.push(opts.inReplyTo);
      if (opts.references) {
        const refs = Array.isArray(opts.references)
          ? opts.references
          : String(opts.references).split(/\s+/).filter(Boolean);
        ids.push(...refs);
      }
      if (ids.length === 0) return;

      // 找触发邮件（messageId 匹配 In-Reply-To / References 任意一个）
      const trigger = await this.prisma.email.findFirst({
        where: { messageId: { in: ids } },
        select: { id: true },
      });
      if (!trigger) return;

      const pending = await this.prisma.followUp.findMany({
        where: { triggerEmailId: trigger.id, status: 'PENDING' },
        select: { id: true },
      });
      if (pending.length === 0) return;

      await this.prisma.followUp.updateMany({
        where: { id: { in: pending.map((p) => p.id) } },
        data: {
          status: 'DONE',
          completedAt: new Date(),
          reason: 'REPLIED',
        },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to resolve follow-up on inbound: ${err?.message}`);
    }
  }

  /**
   * Lead 阶段变化时挂钩：
   *   - CLOSED_WON / CLOSED_LOST → PENDING 跟进打 DISMISSED；
   *   - 其它阶段之间变化 → PENDING 跟进按新阶段重算 dueAt（从今天起算），
   *     不新建也不关闭，保持一条"滚动的下一步"。
   */
  async handleStageChange(
    leadId: string,
    oldStage: string,
    newStage: string,
  ): Promise<void> {
    if (oldStage === newStage) return;
    try {
      const pendings = await this.prisma.followUp.findMany({
        where: { leadId, status: 'PENDING' },
        select: { id: true },
      });
      if (pendings.length === 0) return;

      if (newStage === 'CLOSED_WON' || newStage === 'CLOSED_LOST') {
        await this.prisma.followUp.updateMany({
          where: { id: { in: pendings.map((p) => p.id) } },
          data: { status: 'DISMISSED', reason: 'LEAD_CLOSED' },
        });
        return;
      }

      const days = getFollowUpDays(newStage);
      if (days == null) return;
      const dueAt = addDays(new Date(), days);
      await this.prisma.followUp.updateMany({
        where: { id: { in: pendings.map((p) => p.id) } },
        data: { dueAt, reason: 'STAGE_CHANGED' },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to handle stage change for lead ${leadId}: ${err?.message}`,
      );
    }
  }

  // ==================== QUERIES ====================

  private followUpInclude = {
    lead: {
      select: {
        id: true,
        title: true,
        companyName: true,
        email: true,
        stage: true,
        country: true,
      },
    },
    owner: { select: { id: true, name: true, email: true } },
  };

  async list(filters: ListFilters, userId: string, role: string) {
    const where: any = {};
    // SALESPERSON 强制只看自己的；ADMIN 可按 ownerId 过滤
    if (role === 'ADMIN') {
      if (filters.ownerId) where.ownerId = filters.ownerId;
    } else {
      where.ownerId = userId;
    }
    if (filters.status) where.status = filters.status;
    if (filters.leadId) where.leadId = filters.leadId;
    if (filters.overdueOnly) {
      where.status = 'PENDING';
      where.dueAt = { lte: new Date() };
    }

    const items = await this.prisma.followUp.findMany({
      where,
      include: this.followUpInclude,
      orderBy: [
        { status: 'asc' }, // PENDING 优先
        { dueAt: 'asc' },
      ],
      take: 500,
    });
    return { items };
  }

  /** 小接口给侧栏角标用：返回 {pending, overdue}。 */
  async summary(userId: string) {
    const now = new Date();
    const [pending, overdue] = await Promise.all([
      this.prisma.followUp.count({
        where: { ownerId: userId, status: 'PENDING' },
      }),
      this.prisma.followUp.count({
        where: { ownerId: userId, status: 'PENDING', dueAt: { lte: now } },
      }),
    ]);
    return { pending, overdue };
  }

  /** ADMIN 团队概览：全员 pending/overdue 总数 + 按人分组 breakdown。 */
  async adminOverview() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const [teamPending, teamOverdue] = await Promise.all([
      this.prisma.followUp.count({ where: { status: 'PENDING' } }),
      this.prisma.followUp.count({
        where: { status: 'PENDING', dueAt: { lte: now } },
      }),
    ]);

    // 每人的待跟进 / 逾期 / 近 7 天已完成
    const [byOwnerPending, byOwnerOverdue, byOwnerCompleted] = await Promise.all([
      this.prisma.followUp.groupBy({
        by: ['ownerId'],
        where: { status: 'PENDING' },
        _count: { _all: true },
      }),
      this.prisma.followUp.groupBy({
        by: ['ownerId'],
        where: { status: 'PENDING', dueAt: { lte: now } },
        _count: { _all: true },
      }),
      this.prisma.followUp.groupBy({
        by: ['ownerId'],
        where: { status: 'DONE', completedAt: { gte: weekStart } },
        _count: { _all: true },
      }),
    ]);

    const userIds = new Set<string>([
      ...byOwnerPending.map((r) => r.ownerId),
      ...byOwnerOverdue.map((r) => r.ownerId),
      ...byOwnerCompleted.map((r) => r.ownerId),
    ]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const toMap = (rows: Array<{ ownerId: string; _count: { _all: number } }>) =>
      new Map(rows.map((r) => [r.ownerId, r._count._all]));
    const mPending = toMap(byOwnerPending);
    const mOverdue = toMap(byOwnerOverdue);
    const mCompleted = toMap(byOwnerCompleted);

    const byOwner = Array.from(userIds).map((id) => ({
      userId: id,
      name: userMap.get(id)?.name || '(未知)',
      pending: mPending.get(id) || 0,
      overdue: mOverdue.get(id) || 0,
      completedThisWeek: mCompleted.get(id) || 0,
    }));
    byOwner.sort((a, b) => b.overdue - a.overdue || b.pending - a.pending);

    return { teamPending, teamOverdue, byOwner };
  }

  // ==================== ACTIONS ====================

  private async loadForAction(id: string, userId: string, role: string) {
    const f = await this.prisma.followUp.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('跟进不存在');
    if (role !== 'ADMIN' && f.ownerId !== userId) {
      throw new ForbiddenException('无权操作该跟进');
    }
    return f;
  }

  async markDone(id: string, userId: string, role: string, notes?: string) {
    await this.loadForAction(id, userId, role);
    return this.prisma.followUp.update({
      where: { id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
        completedById: userId,
        notes: notes ?? undefined,
        reason: 'MANUAL_DONE',
      },
      include: this.followUpInclude,
    });
  }

  async snooze(id: string, days: number, userId: string, role: string) {
    if (!Number.isFinite(days) || days <= 0 || days > 60) {
      throw new BadRequestException('推后天数需在 1-60 之间');
    }
    await this.loadForAction(id, userId, role);
    return this.prisma.followUp.update({
      where: { id },
      data: {
        dueAt: addDays(new Date(), days),
        status: 'PENDING',
        reason: 'SNOOZED_AGAIN',
      },
      include: this.followUpInclude,
    });
  }

  async dismiss(id: string, userId: string, role: string) {
    await this.loadForAction(id, userId, role);
    return this.prisma.followUp.update({
      where: { id },
      data: {
        status: 'DISMISSED',
        completedAt: new Date(),
        completedById: userId,
        reason: 'MANUAL_DISMISSED',
      },
    });
  }

  async reassign(
    id: string,
    newOwnerId: string,
    userId: string,
    role: string,
  ) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可转派跟进');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: newOwnerId },
      select: { id: true, isActive: true },
    });
    if (!user || !user.isActive) {
      throw new BadRequestException('目标用户不存在或已停用');
    }
    return this.prisma.followUp.update({
      where: { id },
      data: { ownerId: newOwnerId, reason: 'REASSIGNED' },
      include: this.followUpInclude,
    });
  }

  async createManual(
    dto: { leadId: string; dueAt: string; notes?: string; ownerId?: string },
    userId: string,
    role: string,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
      select: { id: true, ownerId: true },
    });
    if (!lead) throw new NotFoundException('线索不存在');

    // SALESPERSON 只能给自己建（且线索得是自己的）
    let ownerId = dto.ownerId || lead.ownerId || userId;
    if (role !== 'ADMIN') {
      if (lead.ownerId && lead.ownerId !== userId) {
        throw new ForbiddenException('只能为自己名下的线索建跟进');
      }
      ownerId = userId;
    }

    const dueAt = new Date(dto.dueAt);
    if (isNaN(dueAt.getTime())) {
      throw new BadRequestException('dueAt 格式错误');
    }

    return this.prisma.followUp.create({
      data: {
        leadId: dto.leadId,
        ownerId,
        dueAt,
        notes: dto.notes,
        status: 'PENDING',
        reason: 'MANUAL',
      },
      include: this.followUpInclude,
    });
  }

  async remove(id: string, userId: string, role: string) {
    await this.loadForAction(id, userId, role);
    await this.prisma.followUp.delete({ where: { id } });
    return { deleted: true };
  }
}
