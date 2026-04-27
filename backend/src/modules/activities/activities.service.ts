import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import {
  customerVisibility,
  hideEmailsInText,
  CustomerVisibility,
} from '../../common/privacy/customer-visibility';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 按可见性档位决定怎么处理一行 activity。
   * - full   → 原样返回
   * - masked → content 里的邮箱地址直接隐藏成"(邮箱已隐藏)"
   * - denied → 被上层拦截，不会走到这里
   */
  private redactByVisibility<T extends { content?: string | null }>(
    rows: T[],
    visibility: CustomerVisibility,
  ): T[] {
    if (visibility === 'full') return rows;
    return rows.map((r) => ({ ...r, content: hideEmailsInText(r.content) }));
  }

  private async resolveCustomerVisibility(
    customerId: string,
    userId: string,
    role: string,
    isSuperAdmin: boolean | undefined,
  ): Promise<{ visibility: CustomerVisibility; ownerId: string | null }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { ownerId: true },
    });
    if (!customer) {
      throw new ForbiddenException('Customer not found');
    }
    const visibility = customerVisibility(customer.ownerId, {
      userId,
      role,
      isSuperAdmin,
    });
    return { visibility, ownerId: customer.ownerId };
  }

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
    isSuperAdmin?: boolean,
  ) {
    const page = query.page ? parseInt(query.page, 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};
    let visibility: CustomerVisibility = 'full';

    if (query.customerId) {
      // 客户上下文：用三档可见性判定
      const r = await this.resolveCustomerVisibility(
        query.customerId,
        userId,
        role,
        isSuperAdmin,
      );
      if (r.visibility === 'denied') {
        throw new ForbiddenException('You do not have access to this customer');
      }
      visibility = r.visibility;
      where.customerId = query.customerId;
    } else if (role !== 'ADMIN' && !isSuperAdmin) {
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
      items: this.redactByVisibility(items, visibility),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      visibility,
    };
  }

  async findByCustomerId(
    customerId: string,
    userId: string,
    role: string,
    page: number = 1,
    pageSize: number = 20,
    isSuperAdmin?: boolean,
  ) {
    const skip = (page - 1) * pageSize;

    const { visibility } = await this.resolveCustomerVisibility(
      customerId,
      userId,
      role,
      isSuperAdmin,
    );
    if (visibility === 'denied') {
      throw new ForbiddenException('You do not have access to this customer');
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
      items: this.redactByVisibility(items, visibility),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      visibility,
    };
  }
}
