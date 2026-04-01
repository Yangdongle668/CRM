import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateActivityDto) {
    // If customerId is provided, verify ownership for SALESPERSON
    if (dto.customerId) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { ownerId: true },
      });

      if (!customer) {
        throw new ForbiddenException('Customer not found');
      }
    }

    return this.prisma.activity.create({
      data: {
        type: dto.type as any,
        content: dto.content,
        customerId: dto.customerId,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async findAll(
    userId: string,
    role: string,
    query: { customerId?: string; page?: string; pageSize?: string },
  ) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (query.customerId) {
      // Verify customer access for SALESPERSON
      if (role !== 'ADMIN') {
        const customer = await this.prisma.customer.findUnique({
          where: { id: query.customerId },
          select: { ownerId: true },
        });
        if (!customer || customer.ownerId !== userId) {
          throw new ForbiddenException('You do not have access to this customer');
        }
      }
      where.customerId = query.customerId;
    } else if (role !== 'ADMIN') {
      where.ownerId = userId;
    }

    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, companyName: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findByCustomerId(
    customerId: string,
    userId: string,
    role: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const skip = (page - 1) * pageSize;

    // Verify customer access for SALESPERSON
    if (role !== 'ADMIN') {
      const customer = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { ownerId: true },
      });

      if (!customer || customer.ownerId !== userId) {
        throw new ForbiddenException('You do not have access to this customer');
      }
    }

    const where = { customerId };

    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, companyName: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
