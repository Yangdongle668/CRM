import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTaskDto } from './dto/query-task.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTaskDto) {
    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority as any,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
        ownerId: userId,
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
  }

  async findAll(userId: string, role: string, query: QueryTaskDto) {
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);
    const skip = (page - 1) * pageSize;

    const where: Prisma.TaskWhereInput = {};

    // Ownership filtering: SALESPERSON only sees own tasks
    if (role !== 'ADMIN') {
      where.ownerId = userId;
    }

    if (query.status) {
      where.status = query.status as any;
    }

    if (query.priority) {
      where.priority = query.priority as any;
    }

    if (query.dueDateFrom || query.dueDateTo) {
      where.dueDate = {};
      if (query.dueDateFrom) {
        where.dueDate.gte = new Date(query.dueDateFrom);
      }
      if (query.dueDateTo) {
        where.dueDate.lte = new Date(query.dueDateTo);
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string, userId: string, role: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (role !== 'ADMIN' && task.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }

    return task;
  }

  async update(id: string, userId: string, role: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (role !== 'ADMIN' && task.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority as any }),
        ...(dto.status !== undefined && { status: dto.status as any }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.relatedType !== undefined && { relatedType: dto.relatedType }),
        ...(dto.relatedId !== undefined && { relatedId: dto.relatedId }),
      },
      include: { owner: { select: { id: true, name: true, email: true } } },
    });
  }

  async remove(id: string, userId: string, role: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (role !== 'ADMIN' && task.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this task');
    }

    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task deleted successfully' };
  }
}
