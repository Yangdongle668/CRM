import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCustomerDto, userId: string, role: string) {
    const { page = 1, pageSize = 20, search, status, country } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CustomerWhereInput = {};

    // SALESPERSON can only see their own customers
    if (role === 'SALESPERSON') {
      where.ownerId = userId;
    }

    if (search) {
      where.companyName = { contains: search, mode: 'insensitive' };
    }

    if (status) {
      where.status = status;
    }

    if (country) {
      where.country = { contains: country, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { contacts: true, leads: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, userId: string, role: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        contacts: true,
        leads: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }

    if (role === 'SALESPERSON' && customer.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this customer',
      );
    }

    return customer;
  }

  async create(dto: CreateCustomerDto, userId: string) {
    return this.prisma.customer.create({
      data: {
        ...dto,
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    userId: string,
    role: string,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }

    if (role === 'SALESPERSON' && customer.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this customer',
      );
    }

    return this.prisma.customer.update({
      where: { id },
      data: dto,
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async remove(id: string, role: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can delete customers');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }

    return this.prisma.customer.delete({ where: { id } });
  }
}
