import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreateMemoDto {
  title: string;
  content?: string;
  color?: string;
  date?: string;
  pinned?: boolean;
  pinnedStatus?: string;
}

export interface UpdateMemoDto {
  title?: string;
  content?: string;
  color?: string;
  date?: string;
  pinned?: boolean;
  pinnedStatus?: string;
}

export interface CreateTimelineEntryDto {
  contactedAt: string;
  note: string;
}

@Injectable()
export class MemosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 日历视图用：默认排除常驻跟进备忘（pinned=true），它们走 findPinned()
   * 渲染在单独的"跟进备忘"面板。给老前端一个 includePinned 逃生通道。
   */
  async findAll(
    userId: string,
    query: { date?: string; month?: string; includePinned?: boolean },
  ) {
    const where: Prisma.MemoWhereInput = { ownerId: userId };
    if (!query.includePinned) where.pinned = false;

    if (query.date) {
      const date = new Date(query.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      where.date = { gte: date, lt: nextDay };
    } else if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      where.date = { gte: startDate, lt: endDate };
    }

    return this.prisma.memo.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  /**
   * 客户跟进面板：常驻 (pinned=true) 备忘 + 整段时间线一起返回。
   * - status 可选过滤：ACTIVE / DONE / undefined（全部）
   * - 排序：按最近一次联系时间倒序，没有任何 timeline 的退化用 updatedAt
   *   ⇒ "最近又联系过的客户冒到顶"
   */
  async findPinned(userId: string, status?: string) {
    const where: Prisma.MemoWhereInput = { ownerId: userId, pinned: true };
    if (status) where.pinnedStatus = status;

    const memos = await this.prisma.memo.findMany({
      where,
      include: {
        timeline: { orderBy: { contactedAt: 'desc' } },
      },
    });

    return memos.sort((a, b) => {
      const aT = a.timeline[0]?.contactedAt ?? a.updatedAt;
      const bT = b.timeline[0]?.contactedAt ?? b.updatedAt;
      return new Date(bT).getTime() - new Date(aT).getTime();
    });
  }

  async findOne(id: string, userId: string) {
    const memo = await this.prisma.memo.findFirst({
      where: { id, ownerId: userId },
      include: { timeline: { orderBy: { contactedAt: 'desc' } } },
    });
    if (!memo) throw new NotFoundException('Memo not found');
    return memo;
  }

  async create(userId: string, dto: CreateMemoDto) {
    return this.prisma.memo.create({
      data: {
        title: dto.title,
        content: dto.content,
        color: dto.color,
        date: dto.date ? new Date(dto.date) : undefined,
        pinned: dto.pinned ?? false,
        pinnedStatus: dto.pinned ? dto.pinnedStatus || 'ACTIVE' : null,
        ownerId: userId,
      },
      include: { timeline: true },
    });
  }

  async update(id: string, userId: string, dto: UpdateMemoDto) {
    const memo = await this.prisma.memo.findFirst({
      where: { id, ownerId: userId },
    });
    if (!memo) throw new NotFoundException('Memo not found');

    const data: Prisma.MemoUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.date !== undefined) data.date = new Date(dto.date);
    if (dto.pinned !== undefined) {
      data.pinned = dto.pinned;
      // 切换 pinned 状态时同步 pinnedStatus：标为常驻 → ACTIVE 兜底；取消常驻 → 清空
      if (dto.pinned && !memo.pinnedStatus) data.pinnedStatus = 'ACTIVE';
      if (!dto.pinned) data.pinnedStatus = null;
    }
    if (dto.pinnedStatus !== undefined) data.pinnedStatus = dto.pinnedStatus;

    return this.prisma.memo.update({
      where: { id },
      data,
      include: { timeline: { orderBy: { contactedAt: 'desc' } } },
    });
  }

  async remove(id: string, userId: string) {
    const memo = await this.prisma.memo.findFirst({
      where: { id, ownerId: userId },
    });
    if (!memo) throw new NotFoundException('Memo not found');

    await this.prisma.memo.delete({ where: { id } });
    return { message: 'Memo deleted successfully' };
  }

  async getByDateRange(userId: string, startDate: string, endDate: string) {
    return this.prisma.memo.findMany({
      where: {
        ownerId: userId,
        pinned: false, // 日历视图：排除常驻跟进
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      orderBy: { date: 'desc' },
    });
  }

  // ==================== 跟进时间线 ====================

  async addTimelineEntry(
    memoId: string,
    userId: string,
    dto: CreateTimelineEntryDto,
  ) {
    const memo = await this.prisma.memo.findFirst({
      where: { id: memoId, ownerId: userId },
    });
    if (!memo) throw new NotFoundException('Memo not found');
    if (!memo.pinned) {
      throw new BadRequestException(
        'Only pinned (follow-up) memos can have timeline entries',
      );
    }
    if (!dto.note || !dto.note.trim()) {
      throw new BadRequestException('note is required');
    }

    return this.prisma.memoTimelineEntry.create({
      data: {
        memoId,
        contactedAt: new Date(dto.contactedAt),
        note: dto.note.trim(),
      },
    });
  }

  async removeTimelineEntry(entryId: string, userId: string) {
    // 通过 memoId 的所有权校验权限：先查 entry，验证它属于当前用户的 memo
    const entry = await this.prisma.memoTimelineEntry.findUnique({
      where: { id: entryId },
      include: { memo: { select: { ownerId: true } } },
    });
    if (!entry || entry.memo.ownerId !== userId) {
      throw new NotFoundException('Timeline entry not found');
    }
    await this.prisma.memoTimelineEntry.delete({ where: { id: entryId } });
    return { message: 'Timeline entry deleted' };
  }
}
