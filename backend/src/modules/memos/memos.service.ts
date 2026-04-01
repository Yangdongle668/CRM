import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MemosService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, query: { date?: string; month?: string }) {
    const where: Prisma.MemoWhereInput = { ownerId: userId };

    if (query.date) {
      const date = new Date(query.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);
      where.date = {
        gte: date,
        lt: nextDay,
      };
    } else if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 1);
      where.date = {
        gte: startDate,
        lt: endDate,
      };
    }

    return this.prisma.memo.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async create(
    userId: string,
    dto: { title: string; content?: string; color?: string; date?: string },
  ) {
    return this.prisma.memo.create({
      data: {
        title: dto.title,
        content: dto.content,
        color: dto.color,
        date: dto.date ? new Date(dto.date) : undefined,
        ownerId: userId,
      },
    });
  }

  async update(
    id: string,
    userId: string,
    dto: { title?: string; content?: string; color?: string; date?: string },
  ) {
    const memo = await this.prisma.memo.findFirst({
      where: { id, ownerId: userId },
    });

    if (!memo) {
      throw new NotFoundException('Memo not found');
    }

    return this.prisma.memo.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.date !== undefined && { date: new Date(dto.date) }),
      },
    });
  }

  async remove(id: string, userId: string) {
    const memo = await this.prisma.memo.findFirst({
      where: { id, ownerId: userId },
    });

    if (!memo) {
      throw new NotFoundException('Memo not found');
    }

    await this.prisma.memo.delete({ where: { id } });
    return { message: 'Memo deleted successfully' };
  }

  async getByDateRange(userId: string, startDate: string, endDate: string) {
    return this.prisma.memo.findMany({
      where: {
        ownerId: userId,
        date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      orderBy: { date: 'desc' },
    });
  }
}
