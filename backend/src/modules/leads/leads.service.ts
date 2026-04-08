import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadDto, LeadStage } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryLeadDto, userId: string, role: string) {
    const {
      page = 1,
      pageSize = 20,
      search,
      stage,
      ownerId,
      isPublicPool,
      scope,
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.LeadWhereInput = {};

    // Scope-based filtering
    if (scope === 'pool') {
      // Public pool: leads in pool OR without owner
      where.OR = [{ isPublicPool: true }, { ownerId: null }];
    } else if (scope === 'mine') {
      // My leads: owned by current user, not in pool
      where.ownerId = userId;
      where.isPublicPool = false;
    } else {
      // Default: SALESPERSON sees only own leads + public pool
      if (role === 'SALESPERSON') {
        where.OR = [
          { ownerId: userId },
          { isPublicPool: true },
          { ownerId: null },
        ];
      } else if (ownerId) {
        where.ownerId = ownerId;
      }
    }

    if (search) {
      const searchOr: Prisma.LeadWhereInput[] = [
        { title: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
      // Combine search with existing OR conditions using AND
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    if (stage) {
      where.stage = stage;
    }

    if (isPublicPool === 'true') {
      where.isPublicPool = true;
    }

    const orderBy: Prisma.LeadOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        include: {
          owner: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, companyName: true } },
        },
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, userId: string, role: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: {
            owner: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }

    // SALESPERSON can view own leads or public pool
    if (
      role === 'SALESPERSON' &&
      lead.ownerId !== userId &&
      !lead.isPublicPool &&
      lead.ownerId !== null
    ) {
      throw new ForbiddenException(
        'You do not have permission to access this lead',
      );
    }

    return lead;
  }

  async create(dto: CreateLeadDto, userId: string, role: string) {
    const {
      customerId,
      ownerId,
      expectedDate,
      lastContactAt,
      nextFollowUpAt,
      isPublicPool,
      ...rest
    } = dto;

    // Determine effective owner
    let effectiveOwnerId: string | null = userId;
    if (isPublicPool) {
      effectiveOwnerId = null;
    } else if (role === 'ADMIN' && ownerId) {
      effectiveOwnerId = ownerId;
    }

    const data: Prisma.LeadCreateInput = {
      ...rest,
      title: rest.title || rest.companyName || rest.contactName || '未命名线索',
      isPublicPool: isPublicPool ?? false,
      expectedDate: expectedDate ? new Date(expectedDate) : undefined,
      lastContactAt: lastContactAt ? new Date(lastContactAt) : undefined,
      nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : undefined,
    };

    if (effectiveOwnerId) {
      data.owner = { connect: { id: effectiveOwnerId } };
    }

    if (customerId) {
      data.customer = { connect: { id: customerId } };
    }

    return this.prisma.lead.create({
      data,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    userId: string,
    role: string,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }

    if (
      role === 'SALESPERSON' &&
      lead.ownerId !== userId &&
      !lead.isPublicPool &&
      lead.ownerId !== null
    ) {
      throw new ForbiddenException(
        'You do not have permission to update this lead',
      );
    }

    const {
      customerId,
      ownerId,
      expectedDate,
      lastContactAt,
      nextFollowUpAt,
      ...rest
    } = dto;

    const data: Prisma.LeadUpdateInput = { ...rest };

    if (expectedDate !== undefined) {
      data.expectedDate = expectedDate ? new Date(expectedDate) : null;
    }
    if (lastContactAt !== undefined) {
      data.lastContactAt = lastContactAt ? new Date(lastContactAt) : null;
    }
    if (nextFollowUpAt !== undefined) {
      data.nextFollowUpAt = nextFollowUpAt ? new Date(nextFollowUpAt) : null;
    }

    if (customerId !== undefined) {
      data.customer = customerId
        ? { connect: { id: customerId } }
        : { disconnect: true };
    }

    // Only admin can reassign
    if (ownerId !== undefined && role === 'ADMIN') {
      data.owner = ownerId
        ? { connect: { id: ownerId } }
        : { disconnect: true };
    }

    return this.prisma.lead.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async updateStage(
    id: string,
    stage: LeadStage,
    userId: string,
    role: string,
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }

    if (
      role === 'SALESPERSON' &&
      lead.ownerId !== userId &&
      !lead.isPublicPool
    ) {
      throw new ForbiddenException(
        'You do not have permission to update this lead',
      );
    }

    return this.prisma.lead.update({
      where: { id },
      data: { stage: stage as any },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async remove(id: string, userId: string, role: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }

    if (role === 'SALESPERSON' && lead.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this lead',
      );
    }

    return this.prisma.lead.delete({ where: { id } });
  }

  // ==================== 公海 / 认领 ====================

  async claimLead(id: string, userId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }
    if (!lead.isPublicPool && lead.ownerId !== null) {
      throw new BadRequestException('该线索不在公海，无法认领');
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        ownerId: userId,
        isPublicPool: false,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async releaseLead(id: string, userId: string, role: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }
    if (role === 'SALESPERSON' && lead.ownerId !== userId) {
      throw new ForbiddenException('无权释放该线索');
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        isPublicPool: true,
        ownerId: null,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async assignLead(
    id: string,
    targetOwnerId: string,
    role: string,
  ) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可分配线索');
    }
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetOwnerId },
    });
    if (!target) {
      throw new NotFoundException('目标用户不存在');
    }

    return this.prisma.lead.update({
      where: { id },
      data: {
        ownerId: targetOwnerId,
        isPublicPool: false,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async batchAssign(
    ids: string[],
    targetOwnerId: string,
    role: string,
  ) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可批量分配');
    }
    const result = await this.prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: { ownerId: targetOwnerId, isPublicPool: false },
    });
    return { updated: result.count };
  }

  async batchRelease(ids: string[], userId: string, role: string) {
    const where: Prisma.LeadWhereInput = { id: { in: ids } };
    if (role !== 'ADMIN') {
      where.ownerId = userId;
    }
    const result = await this.prisma.lead.updateMany({
      where,
      data: { isPublicPool: true, ownerId: null },
    });
    return { released: result.count };
  }

  async batchDelete(ids: string[], userId: string, role: string) {
    const where: Prisma.LeadWhereInput = { id: { in: ids } };
    if (role !== 'ADMIN') {
      where.ownerId = userId;
    }
    const result = await this.prisma.lead.deleteMany({ where });
    return { deleted: result.count };
  }

  // ==================== 转化为客户 ====================

  async convertToCustomer(id: string, userId: string, role: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }
    if (
      role === 'SALESPERSON' &&
      lead.ownerId !== userId &&
      !lead.isPublicPool
    ) {
      throw new ForbiddenException('无权操作此线索');
    }
    if (lead.customerId) {
      throw new BadRequestException('该线索已关联客户');
    }

    const ownerForCustomer = lead.ownerId || userId;

    const customer = await this.prisma.customer.create({
      data: {
        companyName: lead.companyName || lead.title || '未命名客户',
        country: lead.country || undefined,
        website: lead.website || undefined,
        industry: lead.industry || undefined,
        scale: lead.companySize || undefined,
        source: lead.source || undefined,
        remark: lead.notes || undefined,
        owner: { connect: { id: ownerForCustomer } },
        contacts:
          lead.contactName || lead.email || lead.phone
            ? {
                create: [
                  {
                    name: lead.contactName || lead.companyName || '主要联系人',
                    title: lead.contactTitle || undefined,
                    email: lead.email || undefined,
                    phone: lead.phone || undefined,
                    isPrimary: true,
                  },
                ],
              }
            : undefined,
      },
    });

    await this.prisma.lead.update({
      where: { id },
      data: {
        customerId: customer.id,
        stage: 'CLOSED_WON',
        ownerId: ownerForCustomer,
        isPublicPool: false,
      },
    });

    return customer;
  }

  // ==================== 信息流 / 活动 ====================

  async addActivity(leadId: string, content: string, userId: string, role: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException('线索不存在');
    }
    if (
      role === 'SALESPERSON' &&
      lead.ownerId !== userId &&
      !lead.isPublicPool
    ) {
      throw new ForbiddenException('无权操作此线索');
    }

    const activity = await this.prisma.leadActivity.create({
      data: {
        leadId,
        ownerId: userId,
        content,
      },
      include: {
        owner: { select: { id: true, name: true } },
      },
    });

    // Update last contact time
    await this.prisma.lead.update({
      where: { id: leadId },
      data: { lastContactAt: new Date() },
    });

    return activity;
  }

  async listActivities(leadId: string, userId: string, role: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      throw new NotFoundException('线索不存在');
    }
    if (
      role === 'SALESPERSON' &&
      lead.ownerId !== userId &&
      !lead.isPublicPool &&
      lead.ownerId !== null
    ) {
      throw new ForbiddenException('无权访问此线索');
    }

    return this.prisma.leadActivity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, name: true } },
      },
    });
  }

  // ==================== CSV 导出 ====================

  async exportCsv(query: QueryLeadDto, userId: string, role: string) {
    // Reuse findAll to get all matching leads (no pagination)
    const result = await this.findAll(
      { ...query, page: 1, pageSize: 10000 },
      userId,
      role,
    );

    const headers = [
      '联系人',
      '公司',
      '职位',
      '邮箱',
      '电话',
      '国家',
      '城市',
      '行业',
      '来源',
      '状态',
      '评分',
      '预估价值',
      '货币',
      '归属人',
      '最后联系时间',
      '下次跟进时间',
      '备注',
      '创建时间',
    ];

    const rows = result.items.map((lead: any) => [
      lead.contactName || '',
      lead.companyName || '',
      lead.contactTitle || '',
      lead.email || '',
      lead.phone || '',
      lead.country || '',
      lead.city || '',
      lead.industry || '',
      lead.source || '',
      lead.stage,
      lead.score ?? 0,
      lead.estimatedValue ? Number(lead.estimatedValue) : '',
      lead.currency || '',
      lead.owner?.name || '未分配',
      lead.lastContactAt
        ? new Date(lead.lastContactAt).toISOString()
        : '',
      lead.nextFollowUpAt
        ? new Date(lead.nextFollowUpAt).toISOString()
        : '',
      (lead.notes || '').replace(/\n/g, ' '),
      new Date(lead.createdAt).toISOString(),
    ]);

    const escape = (v: any) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map(escape).join(','))
        .join('\n');

    return csv;
  }
}
