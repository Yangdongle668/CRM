import {
  Injectable,
  Logger,
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
  private readonly logger = new Logger(CustomersService.name);

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
    const customer = await this.prisma.customer.create({
      data: {
        ...dto,
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    // Retroactively link existing emails by domain
    if (dto.website) {
      this.linkEmailsByDomain(customer.id, dto.website, userId).catch((err) =>
        this.logger.error(`Failed to link emails for new customer: ${err.message}`),
      );
    }

    return customer;
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

    const updated = await this.prisma.customer.update({
      where: { id },
      data: dto,
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    // If website changed, retroactively link emails by new domain
    if (dto.website && dto.website !== customer.website) {
      this.linkEmailsByDomain(id, dto.website, userId).catch((err) =>
        this.logger.error(`Failed to link emails for updated customer: ${err.message}`),
      );
    }

    return updated;
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

  /**
   * Retroactively link unmatched emails to a customer by website domain.
   * Matches email addresses whose domain matches the customer's website.
   */
  private async linkEmailsByDomain(customerId: string, website: string, ownerId: string) {
    // Extract domain from website URL
    const domain = website
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();

    if (!domain) return;

    // Skip common public email domains
    const publicDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'qq.com', '163.com', '126.com', 'foxmail.com',
      'icloud.com', 'live.com', 'msn.com', 'aol.com',
      'mail.com', 'protonmail.com', 'zoho.com',
    ];
    if (publicDomains.includes(domain)) return;

    // Find unmatched emails where from/to address contains this domain
    const pattern = `%@${domain}`;
    const unmatchedEmails: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, direction, from_addr as "fromAddr", to_addr as "toAddr", subject, sent_at as "sentAt", received_at as "receivedAt"
       FROM emails
       WHERE customer_id IS NULL
         AND (from_addr ILIKE $1 OR to_addr ILIKE $1)
       ORDER BY COALESCE(sent_at, received_at, created_at) DESC`,
      pattern,
    );

    if (unmatchedEmails.length === 0) return;

    // Link all matched emails to this customer
    await this.prisma.email.updateMany({
      where: {
        id: { in: unmatchedEmails.map((e) => e.id) },
      },
      data: { customerId },
    });

    // Create timeline activities for linked emails
    const activities = unmatchedEmails.map((email) => ({
      type: 'EMAIL' as const,
      content: email.direction === 'INBOUND'
        ? `收到邮件 - 发件人: ${email.fromAddr}，主题: ${email.subject || '(无主题)'}`
        : `发送邮件 - 收件人: ${email.toAddr}，主题: ${email.subject || '(无主题)'}`,
      customerId,
      ownerId,
    }));

    await this.prisma.activity.createMany({ data: activities });

    this.logger.log(
      `Linked ${unmatchedEmails.length} emails to customer ${customerId} by domain ${domain}`,
    );
  }
}
