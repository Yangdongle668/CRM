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

  /**
   * Sync unlinked emails by customer domain and also create activities
   * for linked emails that don't have corresponding activity records yet.
   */
  async syncEmailsByDomain(customerId: string, userId: string, role: string) {
    const customer = await this.findOne(customerId, userId, role);

    if (!customer.website) {
      // Also check for emails already linked but missing activities
      return this.createMissingActivities(customerId, userId);
    }

    // Step 1: Link unmatched emails by domain
    const domain = customer.website
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .toLowerCase();

    if (!domain) return { linked: 0, activitiesCreated: 0 };

    const publicDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'qq.com', '163.com', '126.com', 'foxmail.com',
      'icloud.com', 'live.com', 'msn.com', 'aol.com',
      'mail.com', 'protonmail.com', 'zoho.com',
    ];
    if (publicDomains.includes(domain)) {
      return this.createMissingActivities(customerId, userId);
    }

    const pattern = `%@${domain}`;
    const unmatchedEmails: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT id, direction, from_addr as "fromAddr", to_addr as "toAddr", subject,
              sent_at as "sentAt", received_at as "receivedAt", created_at as "createdAt"
       FROM emails
       WHERE customer_id IS NULL
         AND (from_addr ILIKE $1 OR to_addr ILIKE $1)`,
      pattern,
    );

    if (unmatchedEmails.length > 0) {
      await this.prisma.email.updateMany({
        where: { id: { in: unmatchedEmails.map((e) => e.id) } },
        data: { customerId },
      });

      this.logger.log(`Linked ${unmatchedEmails.length} emails to customer ${customerId} by domain ${domain}`);
    }

    // Step 2: Create activities for all linked emails that don't have them
    const result = await this.createMissingActivities(customerId, userId);

    return { linked: unmatchedEmails.length, activitiesCreated: result.activitiesCreated };
  }

  /**
   * Create activity records for emails linked to a customer that don't have
   * corresponding EMAIL activity records yet.
   */
  private async createMissingActivities(customerId: string, ownerId: string) {
    // Find linked emails that don't have a matching activity
    const emailsWithoutActivity: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT e.id, e.direction, e.from_addr as "fromAddr", e.to_addr as "toAddr",
              e.subject, e.sent_at as "sentAt", e.received_at as "receivedAt", e.created_at as "createdAt"
       FROM emails e
       WHERE e.customer_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM activities a
           WHERE a.customer_id = $1
             AND a.type = 'EMAIL'
             AND a.related_id = e.id
         )
       ORDER BY COALESCE(e.sent_at, e.received_at, e.created_at) DESC`,
      customerId,
    );

    if (emailsWithoutActivity.length === 0) {
      return { activitiesCreated: 0 };
    }

    const activities = emailsWithoutActivity.map((email) => {
      const time = email.sentAt || email.receivedAt || email.createdAt;
      const timeStr = time ? new Date(time).toLocaleString('zh-CN') : '';
      return {
        type: 'EMAIL' as const,
        content: email.direction === 'INBOUND'
          ? `收到邮件 - 发件人: ${email.fromAddr}，主题: ${email.subject || '(无主题)'}`
          : `发送邮件 - 收件人: ${email.toAddr}，主题: ${email.subject || '(无主题)'}`,
        customerId,
        ownerId,
        relatedType: 'email',
        relatedId: email.id,
        createdAt: time || new Date(),
      };
    });

    await this.prisma.activity.createMany({ data: activities });

    this.logger.log(`Created ${activities.length} activities for customer ${customerId}`);
    return { activitiesCreated: activities.length };
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

    // Create timeline activities for linked emails (with relatedId to avoid duplicates)
    await this.createMissingActivities(customerId, ownerId);

    this.logger.log(
      `Linked ${unmatchedEmails.length} emails to customer ${customerId} by domain ${domain}`,
    );
  }
}
