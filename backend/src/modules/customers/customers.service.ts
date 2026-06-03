import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { Prisma } from '@prisma/client';

// 行业 → 客户代码字母 的映射表。新增行业请同步前端 INDUSTRIES。
// 前端只展示中文标签，字母仅用于后端生成 LD-X-0001 形式的客户代码。
const INDUSTRY_LETTER_MAP: Record<string, string> = {
  智能医疗: 'A',
  智能穿戴: 'B',
  消费电子: 'C',
  低空设备: 'D',
  物联网: 'E',
  医疗器械: 'F',
  电子产品: 'G',
  机械设备: 'H',
  汽车配件: 'I',
  纺织服装: 'J',
  化工材料: 'K',
  家居用品: 'L',
  食品饮料: 'M',
  建筑材料: 'N',
  其他: 'Z',
};

function industryToLetter(industry?: string | null): string {
  if (!industry) return 'Z';
  return INDUSTRY_LETTER_MAP[industry] || 'Z';
}

@Injectable()
export class CustomersService implements OnModuleInit {
  private readonly logger = new Logger(CustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // 应用启动时回填历史客户的 customerCode。幂等：只处理 customerCode IS NULL 的行。
    try {
      await this.backfillCustomerCodes();
    } catch (err: any) {
      this.logger.error(
        `Failed to backfill customer codes on startup: ${err?.message || err}`,
      );
    }
  }

  /**
   * 原子地为给定字母分配下一个流水号并返回完整客户代码 LD-{letter}-{0000}。
   *
   * 使用 upsert + increment 保证并发安全：
   * - 计数器行已存在：nextSeq += 1，本次分配 = (新 nextSeq) - 1；
   * - 行不存在：以 nextSeq=2 创建（因为本次分配会消耗 1），本次分配 = 1。
   *
   * 必须在事务中调用，否则计数器递增了但客户创建失败会导致永久跳号。
   */
  private async allocateCustomerCode(
    letter: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const row = await tx.customerCodeSequence.upsert({
      where: { letter },
      update: { nextSeq: { increment: 1 } },
      create: { letter, nextSeq: 2 },
    });
    // upsert 返回操作后的 row。create 分支 nextSeq=2，update 分支 nextSeq 是
    // 自增后的新值；两种情况下本次客户应使用的流水号都是 nextSeq - 1。
    const seq = row.nextSeq - 1;
    return `LD-${letter}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * 回填历史客户的 customerCode。按 createdAt 升序分配，保证旧客户拿到
   * 更小的流水号；同一字母内顺序与建档先后一致。
   */
  async backfillCustomerCodes() {
    const pending = await this.prisma.customer.findMany({
      where: { customerCode: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, industry: true },
    });

    if (pending.length === 0) return;

    this.logger.log(`Backfilling customer codes for ${pending.length} customers...`);

    for (const c of pending) {
      const letter = industryToLetter(c.industry);
      try {
        await this.prisma.$transaction(async (tx) => {
          const code = await this.allocateCustomerCode(letter, tx);
          await tx.customer.update({
            where: { id: c.id },
            data: { customerCode: code },
          });
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to backfill code for customer ${c.id}: ${err?.message || err}`,
        );
      }
    }

    this.logger.log('Customer code backfill complete.');
  }

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

  /**
   * 沉默客户 —— "好久没联系"的温度提示。
   *
   * 找出所有 ACTIVE 状态的客户中，最近一次活动（Activity）距今超过
   * dormantDays 天的那些。SALESPERSON 只看自己的；ADMIN 看全部（虽然
   * 仪表盘组件里一般只关心自己的，这里按角色自动收束）。
   *
   * 无活动记录的，退化成看 updatedAt —— 把客户录入日期当作"首次接触"。
   */
  async findDormant(
    userId: string,
    role: string,
    dormantDays = 30,
    limit = 20,
  ) {
    const threshold = new Date(Date.now() - dormantDays * 86400000);

    const where: Prisma.CustomerWhereInput = { status: 'ACTIVE' };
    if (role === 'SALESPERSON') {
      where.ownerId = userId;
    }

    // 预加载最后一条活动的时间；查多一些（2x）再在应用层过滤，避免边缘
    // 情况漏掉
    const candidates = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        country: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
        activities: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: limit * 3,
    });

    const result = candidates
      .map((c) => {
        const lastActivity = c.activities[0]?.createdAt ?? c.updatedAt;
        return {
          id: c.id,
          companyName: c.companyName,
          country: c.country,
          ownerId: c.ownerId,
          owner: c.owner,
          lastContactAt: lastActivity,
          daysSince: Math.floor(
            (Date.now() - new Date(lastActivity).getTime()) / 86400000,
          ),
        };
      })
      .filter((c) => new Date(c.lastContactAt).getTime() < threshold.getTime())
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, limit);

    return result;
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
    const letter = industryToLetter(dto.industry);

    const customer = await this.prisma.$transaction(async (tx) => {
      const customerCode = await this.allocateCustomerCode(letter, tx);
      return tx.customer.create({
        data: {
          ...dto,
          ownerId: userId,
          customerCode,
        },
        include: {
          owner: { select: { id: true, name: true, email: true } },
        },
      });
    });

    // Retroactively link existing emails by domain (both websites)
    for (const w of [dto.website, dto.website2].filter(Boolean)) {
      this.linkEmailsByDomain(customer.id, w!, userId).catch((err) =>
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

    // 行业变更 → 客户代码的字母段也要更新，但流水号会用新字母的下一个号
    // （而不是复用旧字母的旧号），以保持每字母段内的单调递增 & 不重复。
    // 现有代码的字母段不动，只在 letter 真的发生变化时才重新分配。
    const newLetter =
      dto.industry !== undefined ? industryToLetter(dto.industry) : null;
    const currentLetter = customer.customerCode?.split('-')[1] || null;
    const shouldReissueCode =
      newLetter !== null && newLetter !== currentLetter;

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateData: any = { ...dto };
      if (shouldReissueCode) {
        updateData.customerCode = await this.allocateCustomerCode(newLetter!, tx);
      } else if (!customer.customerCode) {
        // 兜底：历史客户没有代码（backfill 还没跑到）且本次没改行业，借机补一个。
        const letter = industryToLetter(
          dto.industry !== undefined ? dto.industry : customer.industry,
        );
        updateData.customerCode = await this.allocateCustomerCode(letter, tx);
      }
      return tx.customer.update({
        where: { id },
        data: updateData,
        include: {
          owner: { select: { id: true, name: true, email: true } },
        },
      });
    });

    // If either website changed, retroactively link emails by the new domain
    for (const [newW, oldW] of [
      [dto.website, customer.website],
      [(dto as any).website2, (customer as any).website2],
    ]) {
      if (newW && newW !== oldW) {
        this.linkEmailsByDomain(id, newW, userId).catch((err) =>
          this.logger.error(`Failed to link emails for updated customer: ${err.message}`),
        );
      }
    }

    return updated;
  }

  /**
   * Sync unlinked emails by customer domain and also create activities
   * for linked emails that don't have corresponding activity records yet.
   */
  async syncEmailsByDomain(customerId: string, userId: string, role: string) {
    const customer = await this.findOne(customerId, userId, role);

    const websites = [(customer as any).website, (customer as any).website2].filter(Boolean) as string[];
    if (websites.length === 0) {
      // Also check for emails already linked but missing activities
      return this.createMissingActivities(customerId, userId);
    }

    // Step 1: Link unmatched emails by domain (try both websites)
    const domain = websites[0]
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

    // Also link by website2 domain if present
    let linked2 = 0;
    if (websites[1]) {
      await this.linkEmailsByDomain(customerId, websites[1], userId);
      linked2 = 1; // linkEmailsByDomain logs internally
    }

    // Step 2: Create activities for all linked emails that don't have them
    const result = await this.createMissingActivities(customerId, userId);

    return { linked: unmatchedEmails.length + linked2, activitiesCreated: result.activitiesCreated };
  }

  /**
   * Create activity records for emails linked to a customer that don't have
   * corresponding EMAIL activity records yet.
   */
  private async createMissingActivities(customerId: string, ownerId: string) {
    // Find linked emails that don't have a matching activity
    const emailsWithoutActivity: any[] = await this.prisma.$queryRawUnsafe(
      `SELECT e.id, e.direction, e.from_addr as "fromAddr", e.to_addr as "toAddr",
              e.subject, e.sent_at as "sentAt", e.received_at as "receivedAt",
              e.created_at as "createdAt", e.sender_id as "senderId"
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
      return {
        type: 'EMAIL' as const,
        content: email.direction === 'INBOUND'
          ? `收到邮件 - 发件人: ${email.fromAddr}，主题: ${email.subject || '(无主题)'}`
          : `发送邮件 - 收件人: ${email.toAddr}，主题: ${email.subject || '(无主题)'}`,
        customerId,
        ownerId: email.senderId || ownerId,
        relatedType: 'email',
        relatedId: email.id,
        createdAt: time || new Date(),
      };
    });

    await this.prisma.activity.createMany({ data: activities });

    this.logger.log(`Created ${activities.length} activities for customer ${customerId}`);
    return { activitiesCreated: activities.length };
  }

  /**
   * Hard-refresh the timeline for a customer:
   *   1. Sync any un-linked emails by domain.
   *   2. DELETE all existing EMAIL-type activities (wipe stale entries).
   *   3. Re-create from every linked email with the real sentAt/receivedAt.
   *
   * Destructive to old EMAIL activities by design — the user clicks
   * "更新时间线" because existing entries are stale and need rebuilding.
   */
  async refreshTimeline(customerId: string, userId: string, role: string) {
    // Step 1: link any new emails by domain
    await this.syncEmailsByDomain(customerId, userId, role).catch((err) => {
      this.logger.warn(`syncEmailsByDomain failed for ${customerId}: ${err.message}`);
    });

    // Step 2: wipe ALL existing EMAIL activities for this customer
    const deleted = await this.prisma.activity.deleteMany({
      where: { customerId, type: 'EMAIL' },
    });

    // Step 3: rebuild — createMissingActivities now sees zero existing
    // EMAIL activities so it creates one per linked email with the real
    // email timestamp (sentAt / receivedAt).
    const rebuilt = await this.createMissingActivities(customerId, userId);

    return {
      deleted: deleted.count,
      created: rebuilt.activitiesCreated,
    };
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
