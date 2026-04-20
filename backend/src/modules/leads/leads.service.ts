import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadDto, LeadStage } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
import { Prisma } from '@prisma/client';
import { FollowUpsService } from '../follow-ups/follow-ups.service';

const OWNER_SELECT = { id: true, name: true, email: true, role: true } as const;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followUps: FollowUpsService,
  ) {}

  /**
   * Throws ForbiddenException if the lead's current owner is an ADMIN.
   * Pass an already-fetched lead (with owner.role) to avoid an extra DB call.
   */
  private assertNotAdminOwned(lead: any): void {
    if (lead?.owner?.role === 'ADMIN') {
      throw new ForbiddenException('Admin-owned leads cannot be transferred');
    }
  }

  async findAll(query: QueryLeadDto, userId: string, role: string) {
    const {
      page = 1,
      pageSize = 20,
      search,
      stage,
      source,
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
    } else if (scope === 'all') {
      // All leads (admin only)
      if (role !== 'ADMIN') {
        // Non-admin sees own + pool
        where.OR = [
          { ownerId: userId },
          { isPublicPool: true },
          { ownerId: null },
        ];
      } else if (ownerId) {
        // ADMIN 可在 scope=all 下再按负责人过滤
        where.ownerId = ownerId;
      }
    } else {
      // Default (no scope specified): SALESPERSON sees only own leads + public pool
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

    if (source) {
      where.source = source;
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
          owner: { select: OWNER_SELECT },
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
        owner: { select: OWNER_SELECT },
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

  /**
   * 规范化邮箱做比对用：去空格 + 小写。为空返回 null。
   * 导入、单条创建、单条更新都用同一套规则，保证判重行为一致。
   */
  private normalizeEmail(email?: string | null): string | null {
    if (!email) return null;
    const t = email.trim().toLowerCase();
    return t || null;
  }

  /**
   * 在创建 / 更新线索前检查邮箱是否已被其他线索占用。
   * 允许多条 email=NULL 的线索共存（未留邮箱的场景）。
   * 传 excludeId 时忽略自己，用于更新。
   */
  private async assertEmailUnique(
    email: string | null | undefined,
    excludeId?: string,
  ): Promise<void> {
    const norm = this.normalizeEmail(email);
    if (!norm) return;
    const existing = await this.prisma.lead.findFirst({
      where: {
        email: { equals: norm, mode: 'insensitive' },
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, companyName: true },
    });
    if (existing) {
      throw new ConflictException(
        `邮箱 "${norm}" 已被线索「${existing.companyName || existing.id}」占用`,
      );
    }
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

    // 邮箱查重：有相同邮箱的线索就拒绝创建，避免重复录入。
    await this.assertEmailUnique(rest.email);

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
      creator: { connect: { id: userId } },
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
        owner: { select: OWNER_SELECT },
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
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { owner: { select: { role: true } } },
    });

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

    // 改邮箱时：如果改成了别的已占用邮箱则拒绝。不传或保持原样则跳过。
    if (
      rest.email !== undefined &&
      this.normalizeEmail(rest.email) !== this.normalizeEmail(lead.email)
    ) {
      await this.assertEmailUnique(rest.email, id);
    }

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

    // Only admin can reassign; block reassignment of admin-owned leads
    if (ownerId !== undefined && role === 'ADMIN') {
      this.assertNotAdminOwned(lead);
      data.owner = ownerId
        ? { connect: { id: ownerId } }
        : { disconnect: true };
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data,
      include: {
        owner: { select: OWNER_SELECT },
        customer: { select: { id: true, companyName: true } },
      },
    });

    // 阶段变化：让跟进模块按新阶段重算 dueAt，或在 CLOSED_* 时关掉跟进。
    if (rest.stage && rest.stage !== lead.stage) {
      await this.followUps.handleStageChange(id, lead.stage, String(rest.stage));
    }

    return updated;
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

    const updated = await this.prisma.lead.update({
      where: { id },
      data: { stage: stage as any },
      include: {
        owner: { select: OWNER_SELECT },
        customer: { select: { id: true, companyName: true } },
      },
    });

    if (stage !== lead.stage) {
      await this.followUps.handleStageChange(id, lead.stage, String(stage));
    }

    return updated;
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
        owner: { select: OWNER_SELECT },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async releaseLead(id: string, userId: string, role: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { owner: { select: { role: true } } },
    });
    if (!lead) {
      throw new NotFoundException(`Lead with ID "${id}" not found`);
    }
    if (role === 'SALESPERSON' && lead.ownerId !== userId) {
      throw new ForbiddenException('无权释放该线索');
    }
    this.assertNotAdminOwned(lead);

    return this.prisma.lead.update({
      where: { id },
      data: {
        isPublicPool: true,
        ownerId: null,
      },
      include: {
        owner: { select: OWNER_SELECT },
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
        owner: { select: OWNER_SELECT },
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
    return { updated: result.count, skipped: 0 };
  }

  async batchRelease(ids: string[], userId: string, role: string) {
    // Exclude admin-owned leads — they cannot be moved to the pool
    const adminOwned = await this.prisma.lead.findMany({
      where: { id: { in: ids }, owner: { role: 'ADMIN' } },
      select: { id: true },
    });
    const adminOwnedIds = new Set(adminOwned.map((l) => l.id));
    const transferableIds = ids.filter((id) => !adminOwnedIds.has(id));

    const where: Prisma.LeadWhereInput = { id: { in: transferableIds } };
    if (role !== 'ADMIN') {
      where.ownerId = userId;
    }
    const result = await this.prisma.lead.updateMany({
      where,
      data: { isPublicPool: true, ownerId: null },
    });
    return { released: result.count, skipped: adminOwnedIds.size };
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
    // 线索转客户 = 结案，PENDING 跟进关掉
    await this.followUps.handleStageChange(id, lead.stage, 'CLOSED_WON');

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

  private readonly CSV_HEADERS = [
    'ID',
    '公司名称',
    '行业',
    '网站',
    '电话',
    '邮箱',
    '国家',
    '地区',
    '城市',
    '地址',
    '邮编',
    '状态',
    '备注',
    '创建时间',
    '更新时间',
    '创建者ID',
    '负责人ID',
    '对接人姓名',
    '对接人头衔',
    '对接人邮箱',
  ];

  private readonly STAGE_LABEL_MAP: Record<string, string> = {
    NEW: '新建',
    CONTACTED: '已联系',
    QUALIFIED: '已确认',
    PROPOSAL: '方案',
    NEGOTIATION: '谈判',
    CLOSED_WON: '成交',
    CLOSED_LOST: '失败',
  };

  private readonly LABEL_STAGE_MAP: Record<string, string> = Object.fromEntries(
    Object.entries({
      NEW: '新建',
      CONTACTED: '已联系',
      QUALIFIED: '已确认',
      PROPOSAL: '方案',
      NEGOTIATION: '谈判',
      CLOSED_WON: '成交',
      CLOSED_LOST: '失败',
    }).map(([k, v]) => [v, k]),
  );

  private escapeCsvField(v: any): string {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  async exportCsv(query: QueryLeadDto, userId: string, role: string) {
    const result = await this.findAll(
      { ...query, page: 1, pageSize: 10000 },
      userId,
      role,
    );

    const rows = result.items.map((lead: any) => [
      lead.id,
      lead.companyName || '',
      lead.industry || '',
      lead.website || '',
      lead.phone || '',
      lead.email || '',
      lead.country || '',
      lead.region || '',
      lead.city || '',
      lead.address || '',
      lead.postalCode || '',
      this.STAGE_LABEL_MAP[lead.stage] || lead.stage,
      (lead.notes || '').replace(/\n/g, ' '),
      lead.createdAt ? new Date(lead.createdAt).toISOString() : '',
      lead.updatedAt ? new Date(lead.updatedAt).toISOString() : '',
      lead.creatorId || '',
      lead.ownerId || '',
      lead.contactName || '',
      lead.contactTitle || '',
      lead.contactEmail || lead.email || '',
    ]);

    const csv =
      '\uFEFF' +
      [this.CSV_HEADERS, ...rows]
        .map((row) => row.map((v) => this.escapeCsvField(v)).join(','))
        .join('\n');

    return csv;
  }

  // ==================== CSV 导入 ====================

  private parseCsvContent(csvContent: string): string[][] {
    const rows: string[][] = [];
    // Strip BOM
    const content = csvContent.replace(/^\uFEFF/, '');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      if (!line.trim()) continue;
      const cells: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i++; // skip escaped quote
            } else {
              inQuotes = false;
            }
          } else {
            current += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            cells.push(current.trim());
            current = '';
          } else {
            current += ch;
          }
        }
      }
      cells.push(current.trim());
      rows.push(cells);
    }
    return rows;
  }

  async importCsv(csvContent: string, userId: string, role: string) {
    const rows = this.parseCsvContent(csvContent);
    if (rows.length < 2) {
      throw new BadRequestException('CSV 文件为空或格式不正确');
    }

    const headerRow = rows[0];
    // Build column index map from header
    const colIdx: Record<string, number> = {};
    headerRow.forEach((h, i) => {
      colIdx[h.trim()] = i;
    });

    // Validate required header columns exist
    const requiredHeaders = ['公司名称'];
    for (const rh of requiredHeaders) {
      if (colIdx[rh] === undefined) {
        throw new BadRequestException(`缺少必要列: ${rh}`);
      }
    }

    const dataRows = rows.slice(1);

    // Cache valid user IDs for owner validation
    const allUsers = await this.prisma.user.findMany({
      select: { id: true },
    });
    const validUserIds = new Set(allUsers.map((u) => u.id));

    // 预先把库里所有非空邮箱加载到一个 Map: 归一化后的邮箱 -> leadId。
    // CSV 行在下面匹配时一律走这个集合，避免逐行查询数据库。
    const existingEmails = await this.prisma.lead.findMany({
      where: { email: { not: null } },
      select: { id: true, email: true },
    });
    const emailToLeadId = new Map<string, string>();
    for (const e of existingEmails) {
      const n = this.normalizeEmail(e.email);
      if (n) emailToLeadId.set(n, e.id);
    }
    // 本次导入过程中已占用的邮箱（包括这次新建 / 更新到的邮箱）。
    const seenInBatch = new Set<string>();

    const results = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const lineNum = i + 2; // 1-based + header
      try {
        const get = (col: string) => {
          const idx = colIdx[col];
          return idx !== undefined && idx < row.length ? row[idx] : '';
        };

        const id = get('ID');
        const companyName = get('公司名称');
        if (!companyName) {
          results.errors.push(`第${lineNum}行: 公司名称为空，已跳过`);
          results.skipped++;
          continue;
        }

        const stageLabel = get('状态');
        const stage = this.LABEL_STAGE_MAP[stageLabel] || stageLabel || 'NEW';
        // Validate stage value
        const validStages = [
          'NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL',
          'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST',
        ];
        const finalStage = validStages.includes(stage) ? stage : 'NEW';

        const ownerId = get('负责人ID') || null;
        // Validate ownerId if provided
        if (ownerId && !validUserIds.has(ownerId)) {
          results.errors.push(
            `第${lineNum}行: 负责人ID "${ownerId}" 不存在，已设为未分配`,
          );
        }
        const effectiveOwnerId =
          ownerId && validUserIds.has(ownerId) ? ownerId : null;

        const rawEmail = get('邮箱') || '';
        const normEmail = this.normalizeEmail(rawEmail);

        // 邮箱查重：
        //   - 若该邮箱已属于另一条线索（库里的，或本次导入里先出现的），跳过。
        //   - 对"按 ID 更新已有线索"放行：同一条线索自身的邮箱不算冲突。
        if (normEmail) {
          const ownerLeadId = emailToLeadId.get(normEmail);
          const updatingSelf = id && ownerLeadId === id;
          if ((ownerLeadId && !updatingSelf) || seenInBatch.has(normEmail)) {
            results.errors.push(
              `第${lineNum}行: 邮箱 "${normEmail}" 已存在，已跳过`,
            );
            results.skipped++;
            continue;
          }
        }

        const leadData: any = {
          title: companyName,
          companyName,
          industry: get('行业') || undefined,
          website: get('网站') || undefined,
          phone: get('电话') || undefined,
          email: rawEmail || undefined,
          country: get('国家') || undefined,
          region: get('地区') || undefined,
          city: get('城市') || undefined,
          address: get('地址') || undefined,
          postalCode: get('邮编') || undefined,
          stage: finalStage as any,
          notes: get('备注') || undefined,
          contactName: get('对接人姓名') || undefined,
          contactTitle: get('对接人头衔') || undefined,
          contactEmail: get('对接人邮箱') || undefined,
          ownerId: effectiveOwnerId,
          isPublicPool: !effectiveOwnerId,
          creatorId: userId,
        };

        // If ID exists, try to update; otherwise create
        if (id) {
          const existing = await this.prisma.lead.findUnique({
            where: { id },
          });
          if (existing) {
            await this.prisma.lead.update({
              where: { id },
              data: leadData,
            });
            if (normEmail) {
              emailToLeadId.set(normEmail, id);
              seenInBatch.add(normEmail);
            }
            results.updated++;
            continue;
          }
        }

        // Create new lead
        const created = await this.prisma.lead.create({ data: leadData });
        if (normEmail) {
          emailToLeadId.set(normEmail, created.id);
          seenInBatch.add(normEmail);
        }
        results.created++;
      } catch (err: any) {
        results.errors.push(
          `第${lineNum}行: ${err.message || '未知错误'}`,
        );
      }
    }

    return results;
  }
}
