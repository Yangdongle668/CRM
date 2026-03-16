import {
  Injectable,
  NotFoundException,
  ForbiddenException,
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
    const { page = 1, pageSize = 20, search, stage, ownerId } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.LeadWhereInput = {};

    // SALESPERSON can only see their own leads
    if (role === 'SALESPERSON') {
      where.ownerId = userId;
    } else if (ownerId) {
      // ADMIN can filter by ownerId
      where.ownerId = ownerId;
    }

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (stage) {
      where.stage = stage;
    }

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
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
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }

    if (role === 'SALESPERSON' && lead.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this lead',
      );
    }

    return lead;
  }

  async create(dto: CreateLeadDto, userId: string) {
    const data: Prisma.LeadCreateInput = {
      title: dto.title,
      description: dto.description,
      stage: dto.stage as any,
      expectedAmount: dto.expectedAmount,
      expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
      source: dto.source,
      priority: dto.priority,
      owner: { connect: { id: userId } },
    };

    if (dto.customerId) {
      data.customer = { connect: { id: dto.customerId } };
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

    if (role === 'SALESPERSON' && lead.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this lead',
      );
    }

    const { customerId, expectedDate, ...rest } = dto;

    const data: Prisma.LeadUpdateInput = {
      ...rest,
    };

    if (expectedDate !== undefined) {
      data.expectedDate = expectedDate ? new Date(expectedDate) : null;
    }

    if (customerId !== undefined) {
      data.customer = customerId
        ? { connect: { id: customerId } }
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

    if (role === 'SALESPERSON' && lead.ownerId !== userId) {
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
}
