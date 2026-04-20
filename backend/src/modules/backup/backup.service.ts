import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import * as AdmZip from 'adm-zip';
import * as bcrypt from 'bcryptjs';
import { parse as parseCsv } from 'csv-parse/sync';
import { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QUEUE_BACKUP,
  BACKUP_JOB_EXPORT,
} from '../../queue/queue.constants';

export interface ImportResult {
  imported: Record<string, number>;
  skipped: string[];
  currentUserPreserved: boolean;
}

/**
 * Which tables land in a backup, and how each row should be flattened to
 * CSV columns. We deliberately skip email-related data and other ephemeral
 * stores (messages, memos, tracking) — see the README / commit notes.
 *
 * The `rows()` function is async so each table can pull what it needs in
 * a single query. `map()` returns a plain object whose keys become the
 * CSV header; unknown / null values are rendered as empty strings.
 */
interface BackupTableSpec {
  filename: string;          // e.g. "customers.csv"
  description: string;       // human note, included in README.txt
  rows: (prisma: PrismaService) => Promise<any[]>;
  map: (row: any) => Record<string, any>;
}

function formatDate(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return String(v);
}

function decimalToString(v: any): string {
  if (v === null || v === undefined) return '';
  // Prisma Decimal has .toString(); JS number/string pass through.
  if (typeof v === 'object' && typeof v.toString === 'function') return v.toString();
  return String(v);
}

/**
 * Render one CSV row from an ordered value array. Follows RFC 4180:
 *   - commas, double-quotes, and line breaks trigger quoting
 *   - embedded quotes are doubled
 */
function csvRow(values: Array<string | number | null | undefined>): string {
  return values
    .map((v) => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'string' ? v : String(v);
      if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    })
    .join(',');
}

/**
 * Turn an array of plain objects into a CSV string. Header columns come
 * from the union of keys on the first row (we control the shape in the
 * per-table `map()`, so ordering is stable).
 */
function objectsToCsv(rows: Array<Record<string, any>>, headers: string[]): string {
  const out: string[] = [];
  out.push(csvRow(headers));
  for (const row of rows) {
    out.push(csvRow(headers.map((h) => row[h] ?? '')));
  }
  // Prepend UTF-8 BOM so Excel opens Chinese columns correctly.
  return '\uFEFF' + out.join('\r\n') + '\r\n';
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private prisma: PrismaService,
    @Optional()
    @InjectQueue(QUEUE_BACKUP)
    private readonly backupQueue?: Queue,
  ) {}

  /**
   * The set of tables included in a backup. Intentionally excludes
   * emails / email_configs / email_threads / email_templates, messages,
   * memos, documents (uploaded files can't round-trip via CSV),
   * audit logs and system settings.
   */
  private readonly tables: BackupTableSpec[] = [
    {
      filename: 'users.csv',
      description: '系统用户（客户 / 线索 / 订单 / 任务等数据的归属人）',
      rows: (p) =>
        p.user.findMany({
          select: {
            id: true, email: true, name: true, role: true, phone: true,
            bio: true, isActive: true, createdAt: true, updatedAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        phone: r.phone || '',
        bio: r.bio || '',
        isActive: r.isActive ? 'true' : 'false',
        createdAt: formatDate(r.createdAt),
        updatedAt: formatDate(r.updatedAt),
      }),
    },
    {
      filename: 'customers.csv',
      description: '客户主档',
      rows: (p) =>
        p.customer.findMany({
          include: { owner: { select: { email: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r) => ({
        id: r.id,
        companyName: r.companyName,
        country: r.country || '',
        address: r.address || '',
        website: r.website || '',
        website2: r.website2 || '',
        industry: r.industry || '',
        scale: r.scale || '',
        source: r.source || '',
        status: r.status,
        remark: r.remark || '',
        ownerId: r.ownerId || '',
        ownerEmail: r.owner?.email || '',
        ownerName: r.owner?.name || '',
        createdAt: formatDate(r.createdAt),
        updatedAt: formatDate(r.updatedAt),
      }),
    },
    {
      filename: 'contacts.csv',
      description: '客户联系人',
      rows: (p) =>
        p.contact.findMany({
          include: { customer: { select: { companyName: true } } },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r: any) => ({
        id: r.id,
        customerId: r.customerId,
        customerName: r.customer?.companyName || '',
        name: r.name,
        title: r.title || '',
        email: r.email || '',
        phone: r.phone || '',
        wechat: r.wechat || '',
        whatsapp: r.whatsapp || '',
        isPrimary: r.isPrimary ? 'true' : 'false',
        remark: r.remark || '',
        createdAt: formatDate(r.createdAt),
        updatedAt: formatDate(r.updatedAt),
      }),
    },
    {
      filename: 'leads.csv',
      description: '销售线索',
      rows: (p) =>
        p.lead.findMany({
          include: {
            owner: { select: { email: true, name: true } },
            creator: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r: any) => ({
        id: r.id,
        title: r.title,
        companyName: r.companyName || '',
        contactName: r.contactName || '',
        contactTitle: r.contactTitle || '',
        contactEmail: r.contactEmail || '',
        email: r.email || '',
        phone: r.phone || '',
        website: r.website || '',
        industry: r.industry || '',
        stage: r.stage,
        score: r.score ?? 0,
        priority: r.priority ?? 0,
        source: r.source || '',
        country: r.country || '',
        region: r.region || '',
        city: r.city || '',
        address: r.address || '',
        postalCode: r.postalCode || '',
        currency: r.currency || '',
        estimatedValue: decimalToString(r.estimatedValue),
        expectedAmount: decimalToString(r.expectedAmount),
        expectedDate: formatDate(r.expectedDate),
        lastContactAt: formatDate(r.lastContactAt),
        nextFollowUpAt: formatDate(r.nextFollowUpAt),
        customerId: r.customerId || '',
        ownerId: r.ownerId || '',
        ownerEmail: r.owner?.email || '',
        ownerName: r.owner?.name || '',
        creatorId: r.creatorId || '',
        creatorEmail: r.creator?.email || '',
        creatorName: r.creator?.name || '',
        notes: r.notes || '',
        createdAt: formatDate(r.createdAt),
        updatedAt: formatDate(r.updatedAt),
      }),
    },
    {
      filename: 'quotations.csv',
      description: '报价单',
      rows: (p) =>
        p.quotation.findMany({
          include: {
            customer: { select: { companyName: true } },
            owner: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r: any) => ({
        id: r.id,
        quotationNo: r.quotationNo,
        title: r.title,
        customerId: r.customerId,
        customerName: r.customer?.companyName || '',
        ownerId: r.ownerId,
        ownerEmail: r.owner?.email || '',
        ownerName: r.owner?.name || '',
        currency: r.currency,
        totalAmount: decimalToString(r.totalAmount),
        status: r.status,
        validUntil: formatDate(r.validUntil),
        terms: r.terms || '',
        remark: r.remark || '',
        createdAt: formatDate(r.createdAt),
        updatedAt: formatDate(r.updatedAt),
      }),
    },
    {
      filename: 'quotation_items.csv',
      description: '报价单行项',
      rows: (p) =>
        p.quotationItem.findMany({ orderBy: [{ quotationId: 'asc' }, { sortOrder: 'asc' }] }),
      map: (r: any) => ({
        id: r.id,
        quotationId: r.quotationId,
        productName: r.productName,
        description: r.description || '',
        unit: r.unit || '',
        quantity: decimalToString(r.quantity),
        unitPrice: decimalToString(r.unitPrice),
        totalPrice: decimalToString(r.totalPrice),
        sortOrder: r.sortOrder ?? 0,
      }),
    },
    {
      filename: 'orders.csv',
      description: '订单',
      rows: (p) =>
        p.order.findMany({
          include: {
            customer: { select: { companyName: true } },
            owner: { select: { email: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r: any) => ({
        id: r.id,
        orderNo: r.orderNo,
        title: r.title,
        customerId: r.customerId,
        customerName: r.customer?.companyName || '',
        ownerId: r.ownerId,
        ownerEmail: r.owner?.email || '',
        ownerName: r.owner?.name || '',
        currency: r.currency,
        totalAmount: decimalToString(r.totalAmount),
        floorPrice: decimalToString(r.floorPrice),
        costTypes: Array.isArray(r.costTypes) ? r.costTypes.join('|') : '',
        status: r.status,
        paymentStatus: r.paymentStatus,
        shippingAddr: r.shippingAddr || '',
        shippingDate: formatDate(r.shippingDate),
        deliveryDate: formatDate(r.deliveryDate),
        trackingNo: r.trackingNo || '',
        remark: r.remark || '',
        createdAt: formatDate(r.createdAt),
        updatedAt: formatDate(r.updatedAt),
      }),
    },
    {
      filename: 'order_items.csv',
      description: '订单行项',
      rows: (p) =>
        p.orderItem.findMany({ orderBy: [{ orderId: 'asc' }, { id: 'asc' }] }),
      map: (r: any) => ({
        id: r.id,
        orderId: r.orderId,
        productName: r.productName,
        description: r.description || '',
        unit: r.unit || '',
        quantity: decimalToString(r.quantity),
        unitPrice: decimalToString(r.unitPrice),
        totalPrice: decimalToString(r.totalPrice),
        sortOrder: r.sortOrder ?? 0,
      }),
    },
    {
      filename: 'tasks.csv',
      description: '任务（含客户/线索关联）',
      rows: (p) =>
        p.task.findMany({
          include: { owner: { select: { email: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description || '',
        priority: r.priority,
        status: r.status,
        dueDate: formatDate(r.dueDate),
        ownerId: r.ownerId,
        ownerEmail: r.owner?.email || '',
        ownerName: r.owner?.name || '',
        relatedType: r.relatedType || '',
        relatedId: r.relatedId || '',
        createdAt: formatDate(r.createdAt),
        updatedAt: formatDate(r.updatedAt),
      }),
    },
    {
      filename: 'activities.csv',
      description: '跟进记录',
      rows: (p) =>
        p.activity.findMany({
          include: { owner: { select: { email: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
      map: (r: any) => ({
        id: r.id,
        type: r.type,
        content: r.content || '',
        customerId: r.customerId || '',
        ownerId: r.ownerId,
        ownerEmail: r.owner?.email || '',
        ownerName: r.owner?.name || '',
        relatedType: r.relatedType || '',
        relatedId: r.relatedId || '',
        createdAt: formatDate(r.createdAt),
      }),
    },
  ];

  /**
   * Render all backup CSVs into memory. Used by the async worker (to
   * write the ZIP to disk) and by tests. For live HTTP export use
   * `streamBackupZip` instead so the ZIP is piped straight to the
   * response without buffering every CSV.
   */
  async buildBackupFiles(): Promise<Array<{ name: string; content: string }>> {
    const files: Array<{ name: string; content: string }> = [];
    const manifest: Array<{ file: string; description: string; rows: number }> = [];

    for (const spec of this.tables) {
      const rows = await spec.rows(this.prisma);
      const mapped = rows.map((r) => spec.map(r));
      const headers = mapped.length > 0 ? Object.keys(mapped[0]) : this.headersFromSpec(spec);
      files.push({ name: spec.filename, content: objectsToCsv(mapped, headers) });
      manifest.push({ file: spec.filename, description: spec.description, rows: mapped.length });
    }

    // Drop a small README so whoever opens the zip knows what's in it.
    files.push({
      name: 'README.txt',
      content: this.readmeText(manifest),
    });
    return files;
  }

  /** Stream a ZIP containing the CSVs directly to the Express response. */
  async streamBackupZip(res: Response, filename: string): Promise<void> {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (err) => {
      if ((err as any).code !== 'ENOENT') this.logger.warn(`archive: ${err.message}`);
    });
    archive.on('error', (err) => {
      this.logger.error(`archive error: ${err.message}`);
      try { res.status(500).end(); } catch {}
    });
    archive.pipe(res);

    let totalRows = 0;
    const manifest: Array<{ file: string; description: string; rows: number }> = [];
    for (const spec of this.tables) {
      const rows = await spec.rows(this.prisma);
      const mapped = rows.map((r) => spec.map(r));
      const headers = mapped.length > 0 ? Object.keys(mapped[0]) : this.headersFromSpec(spec);
      archive.append(objectsToCsv(mapped, headers), { name: spec.filename });
      manifest.push({ file: spec.filename, description: spec.description, rows: mapped.length });
      totalRows += mapped.length;
    }
    archive.append(this.readmeText(manifest), { name: 'README.txt' });
    await archive.finalize();
    this.logger.log(
      `Backup zip streamed: ${filename} (${manifest.length} CSV files, ${totalRows} rows)`,
    );
  }

  /** Async flavour: writes the ZIP into uploads/backups/. */
  async queueExport(): Promise<{ queued: boolean; jobId?: string; message: string }> {
    if (!this.backupQueue) {
      throw new BadRequestException(
        'Backup queue is not configured (Redis unavailable)',
      );
    }
    const job = await this.backupQueue.add(
      BACKUP_JOB_EXPORT,
      { requestedAt: new Date().toISOString() },
      { jobId: `export-${Date.now()}` },
    );
    return {
      queued: true,
      jobId: String(job.id),
      message: 'Backup export queued',
    };
  }

  async exportToDisk(): Promise<{ filePath: string; fileName: string; size: number }> {
    const dir = path.join(process.cwd(), 'uploads', 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `crm-backup-${stamp}.zip`;
    const filePath = path.join(dir, fileName);

    const files = await this.buildBackupFiles();
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', reject);
      archive.pipe(output);
      for (const f of files) {
        archive.append(f.content, { name: f.name });
      }
      void archive.finalize();
    });

    const stats = fs.statSync(filePath);
    this.logger.log(`Backup written: ${filePath} (${stats.size} bytes)`);
    return { filePath, fileName, size: stats.size };
  }

  private headersFromSpec(spec: BackupTableSpec): string[] {
    // Best-effort: run the mapper against {} to infer keys. Each mapper
    // uses defensive `|| ''` so this doesn't blow up on missing fields.
    try {
      return Object.keys(spec.map({} as any));
    } catch {
      return [];
    }
  }

  private readmeText(
    manifest: Array<{ file: string; description: string; rows: number }>,
  ): string {
    const lines: string[] = [];
    lines.push('外贸 CRM — 数据备份 (CSV)');
    lines.push(`导出时间: ${new Date().toISOString()}`);
    lines.push('');
    lines.push('包含的表：');
    for (const m of manifest) {
      lines.push(`  - ${m.file.padEnd(22)} ${m.rows} 行  ${m.description}`);
    }
    lines.push('');
    lines.push('未包含：邮件 (emails / email_configs / email_threads / email_templates)、');
    lines.push('        系统消息、备忘录、文档附件、审计日志、系统设置。');
    lines.push('        如需恢复这些数据，请使用数据库级备份 (pg_dump)。');
    lines.push('');
    lines.push('字符编码：UTF-8 (含 BOM，直接用 Excel 打开可正确显示中文)');
    return lines.join('\n') + '\n';
  }

  // ==================== Restore ====================

  /**
   * Restore data from a backup ZIP produced by this module.
   *
   * Strategy:
   *   1. Extract the ZIP in memory, parse each CSV.
   *   2. Validate that at least one known table is present.
   *   3. In a single transaction:
   *      a. Delete all rows from the tables we manage — plus the "orphan"
   *         tables that reference them via required FKs (emails,
   *         email_configs, PIs, documents, memos, messages) so the
   *         cascade doesn't fail. System tables (roles, permissions,
   *         role_permissions, system_settings, audit_logs) are preserved.
   *      b. The currently-logged-in user is preserved intact so the
   *         admin running the restore doesn't get logged out mid-flight.
   *      c. Insert users → customers → contacts/leads → quotations/orders
   *         → tasks/activities in FK order.
   *   4. Return a summary of row counts imported.
   *
   * Note: user passwords are NOT in the backup. Restored users (that
   * aren't the current admin) get a random password and must go
   * through password-reset to sign in.
   */
  async importFromZip(
    buffer: Buffer,
    opts: { currentUserId?: string } = {},
  ): Promise<ImportResult> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('备份文件为空');
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch (err: any) {
      throw new BadRequestException(
        `无法解析 ZIP 文件: ${err?.message || err}`,
      );
    }

    // Extract every CSV into a map keyed by filename (basename only).
    const csvMap = new Map<string, string>();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const base = path.basename(entry.entryName);
      if (!base.toLowerCase().endsWith('.csv')) continue;
      csvMap.set(base, entry.getData().toString('utf-8'));
    }

    if (csvMap.size === 0) {
      throw new BadRequestException(
        '备份文件中未找到任何 CSV，请确认上传的是系统导出的备份 ZIP',
      );
    }

    const parse = (csv: string | undefined): any[] => {
      if (!csv) return [];
      return parseCsv(csv, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: false,
      });
    };

    const users = parse(csvMap.get('users.csv'));
    const customers = parse(csvMap.get('customers.csv'));
    const contacts = parse(csvMap.get('contacts.csv'));
    const leads = parse(csvMap.get('leads.csv'));
    const quotations = parse(csvMap.get('quotations.csv'));
    const quotationItems = parse(csvMap.get('quotation_items.csv'));
    const orders = parse(csvMap.get('orders.csv'));
    const orderItems = parse(csvMap.get('order_items.csv'));
    const tasks = parse(csvMap.get('tasks.csv'));
    const activities = parse(csvMap.get('activities.csv'));

    if (users.length === 0 && customers.length === 0) {
      throw new BadRequestException(
        '备份文件中既没有用户也没有客户数据，拒绝执行恢复',
      );
    }

    const skipped: string[] = [];
    for (const known of [
      'users.csv',
      'customers.csv',
      'contacts.csv',
      'leads.csv',
      'quotations.csv',
      'quotation_items.csv',
      'orders.csv',
      'order_items.csv',
      'tasks.csv',
      'activities.csv',
    ]) {
      if (!csvMap.has(known)) skipped.push(known);
    }

    const currentUserId = opts.currentUserId;

    this.logger.log(
      `Starting restore — users=${users.length} customers=${customers.length} ` +
        `contacts=${contacts.length} leads=${leads.length} ` +
        `quotations=${quotations.length} orders=${orders.length} ` +
        `tasks=${tasks.length} activities=${activities.length}`,
    );

    const imported: Record<string, number> = {};

    await this.prisma.$transaction(
      async (tx) => {
        // -------- 1) Wipe existing data in FK-reverse order --------
        // Tables referenced ONLY by backup tables (safe to wipe):
        await tx.activity.deleteMany();
        await tx.task.deleteMany();
        await tx.orderItem.deleteMany();
        await tx.order.deleteMany();
        await tx.quotationItem.deleteMany();
        await tx.quotation.deleteMany();

        // Tables that reference customers / users but aren't backed up.
        // Wipe them too so the parent delete below succeeds.
        await this.safeDeleteAll(tx, 'piItem');
        await this.safeDeleteAll(tx, 'proformaInvoice');
        await this.safeDeleteAll(tx, 'leadActivity');
        await this.safeDeleteAll(tx, 'document');
        await this.safeDeleteAll(tx, 'memo');
        await this.safeDeleteAll(tx, 'email');
        await this.safeDeleteAll(tx, 'emailThread');
        await this.safeDeleteAll(tx, 'emailTemplate');
        await this.safeDeleteAll(tx, 'emailConfig');
        await this.safeDeleteAll(tx, 'message');

        // Now safe to remove the backup-managed tables.
        await tx.lead.deleteMany();
        await tx.contact.deleteMany();
        await tx.customer.deleteMany();

        // Users: keep the current admin so the session stays valid.
        if (currentUserId) {
          await tx.user.deleteMany({ where: { id: { not: currentUserId } } });
        } else {
          await tx.user.deleteMany();
        }

        // -------- 2) Insert in FK order --------

        // Users — if a CSV row matches the current user, update metadata
        // only; otherwise create with a placeholder password.
        for (const u of users) {
          const data = {
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role || 'SALESPERSON',
            phone: u.phone || null,
            bio: u.bio || null,
            isActive: this.parseBool(u.isActive, true),
          };
          if (!data.id || !data.email || !data.name) continue;
          if (currentUserId && data.id === currentUserId) {
            await tx.user.update({
              where: { id: data.id },
              data: {
                email: data.email,
                name: data.name,
                role: data.role,
                phone: data.phone,
                bio: data.bio,
                isActive: data.isActive,
              },
            });
          } else {
            const placeholder = await bcrypt.hash(
              `restored-${data.id}-${Date.now()}`,
              10,
            );
            await tx.user.create({ data: { ...data, password: placeholder } });
          }
        }
        imported.users = users.length;

        // Customers
        for (const c of customers) {
          if (!c.id || !c.companyName || !c.ownerId) continue;
          await tx.customer.create({
            data: {
              id: c.id,
              companyName: c.companyName,
              country: c.country || null,
              address: c.address || null,
              website: c.website || null,
              website2: c.website2 || null,
              industry: c.industry || null,
              scale: c.scale || null,
              source: c.source || null,
              status: (c.status || 'POTENTIAL') as any,
              remark: c.remark || null,
              ownerId: c.ownerId,
              createdAt: this.parseDate(c.createdAt) || undefined,
              updatedAt: this.parseDate(c.updatedAt) || undefined,
            },
          });
        }
        imported.customers = customers.length;

        // Contacts
        for (const ct of contacts) {
          if (!ct.id || !ct.customerId || !ct.name) continue;
          await tx.contact.create({
            data: {
              id: ct.id,
              customerId: ct.customerId,
              name: ct.name,
              title: ct.title || null,
              email: ct.email || null,
              phone: ct.phone || null,
              wechat: ct.wechat || null,
              whatsapp: ct.whatsapp || null,
              isPrimary: this.parseBool(ct.isPrimary, false),
              remark: ct.remark || null,
              createdAt: this.parseDate(ct.createdAt) || undefined,
              updatedAt: this.parseDate(ct.updatedAt) || undefined,
            },
          });
        }
        imported.contacts = contacts.length;

        // Leads —— 备份里如果有重复邮箱（同一个人被导出了两次，或备份文件
        // 被用户手改过），这里按邮箱去重：同邮箱的第二条及之后全部跳过，
        // 和 CSV 导入 / 单条新建保持一致的"一邮箱一条线索"规则。
        const seenLeadEmails = new Set<string>();
        let leadsInserted = 0;
        for (const l of leads) {
          if (!l.id || !l.title) continue;
          const normEmail = (l.email || '').trim().toLowerCase();
          if (normEmail && seenLeadEmails.has(normEmail)) {
            this.logger.warn(
              `Skipping duplicate lead email in backup: ${normEmail} (${l.companyName || l.id})`,
            );
            continue;
          }
          await tx.lead.create({
            data: {
              id: l.id,
              title: l.title,
              companyName: l.companyName || null,
              contactName: l.contactName || null,
              contactTitle: l.contactTitle || null,
              contactEmail: l.contactEmail || null,
              email: l.email || null,
              phone: l.phone || null,
              website: l.website || null,
              industry: l.industry || null,
              stage: (l.stage || 'NEW') as any,
              score: this.parseInt(l.score, 0),
              priority: this.parseInt(l.priority, 0),
              source: l.source || null,
              country: l.country || null,
              region: l.region || null,
              city: l.city || null,
              address: l.address || null,
              postalCode: l.postalCode || null,
              currency: l.currency || 'USD',
              estimatedValue: this.parseDecimal(l.estimatedValue),
              expectedAmount: this.parseDecimal(l.expectedAmount),
              expectedDate: this.parseDate(l.expectedDate),
              lastContactAt: this.parseDate(l.lastContactAt),
              nextFollowUpAt: this.parseDate(l.nextFollowUpAt),
              customerId: l.customerId || null,
              ownerId: l.ownerId || null,
              creatorId: l.creatorId || null,
              notes: l.notes || null,
              createdAt: this.parseDate(l.createdAt) || undefined,
              updatedAt: this.parseDate(l.updatedAt) || undefined,
            },
          });
          if (normEmail) seenLeadEmails.add(normEmail);
          leadsInserted++;
        }
        imported.leads = leadsInserted;

        // Quotations
        for (const q of quotations) {
          if (!q.id || !q.quotationNo || !q.customerId || !q.ownerId) continue;
          await tx.quotation.create({
            data: {
              id: q.id,
              quotationNo: q.quotationNo,
              customerId: q.customerId,
              ownerId: q.ownerId,
              title: q.title || '',
              currency: q.currency || 'USD',
              totalAmount: this.parseDecimal(q.totalAmount) || 0,
              status: (q.status || 'DRAFT') as any,
              validUntil: this.parseDate(q.validUntil),
              terms: q.terms || null,
              remark: q.remark || null,
              createdAt: this.parseDate(q.createdAt) || undefined,
              updatedAt: this.parseDate(q.updatedAt) || undefined,
            },
          });
        }
        imported.quotations = quotations.length;

        for (const qi of quotationItems) {
          if (!qi.id || !qi.quotationId || !qi.productName) continue;
          await tx.quotationItem.create({
            data: {
              id: qi.id,
              quotationId: qi.quotationId,
              productName: qi.productName,
              description: qi.description || null,
              unit: qi.unit || 'PCS',
              quantity: this.parseInt(qi.quantity, 0),
              unitPrice: this.parseDecimal(qi.unitPrice) || 0,
              totalPrice: this.parseDecimal(qi.totalPrice) || 0,
              sortOrder: this.parseInt(qi.sortOrder, 0),
            },
          });
        }
        imported.quotationItems = quotationItems.length;

        // Orders
        for (const o of orders) {
          if (!o.id || !o.orderNo || !o.customerId || !o.ownerId) continue;
          await tx.order.create({
            data: {
              id: o.id,
              orderNo: o.orderNo,
              customerId: o.customerId,
              ownerId: o.ownerId,
              title: o.title || '',
              currency: o.currency || 'USD',
              totalAmount: this.parseDecimal(o.totalAmount) || 0,
              status: (o.status || 'PENDING') as any,
              paymentStatus: (o.paymentStatus || 'UNPAID') as any,
              costTypes: o.costTypes
                ? String(o.costTypes).split('|').filter(Boolean)
                : [],
              floorPrice: this.parseDecimal(o.floorPrice),
              shippingAddr: o.shippingAddr || null,
              shippingDate: this.parseDate(o.shippingDate),
              deliveryDate: this.parseDate(o.deliveryDate),
              trackingNo: o.trackingNo || null,
              remark: o.remark || null,
              createdAt: this.parseDate(o.createdAt) || undefined,
              updatedAt: this.parseDate(o.updatedAt) || undefined,
            },
          });
        }
        imported.orders = orders.length;

        for (const oi of orderItems) {
          if (!oi.id || !oi.orderId || !oi.productName) continue;
          await tx.orderItem.create({
            data: {
              id: oi.id,
              orderId: oi.orderId,
              productName: oi.productName,
              description: oi.description || null,
              unit: oi.unit || 'PCS',
              quantity: this.parseInt(oi.quantity, 0),
              unitPrice: this.parseDecimal(oi.unitPrice) || 0,
              totalPrice: this.parseDecimal(oi.totalPrice) || 0,
              sortOrder: this.parseInt(oi.sortOrder, 0),
            },
          });
        }
        imported.orderItems = orderItems.length;

        // Tasks
        for (const t of tasks) {
          if (!t.id || !t.title || !t.ownerId) continue;
          await tx.task.create({
            data: {
              id: t.id,
              title: t.title,
              description: t.description || null,
              priority: (t.priority || 'MEDIUM') as any,
              status: (t.status || 'PENDING') as any,
              dueDate: this.parseDate(t.dueDate),
              ownerId: t.ownerId,
              relatedType: t.relatedType || null,
              relatedId: t.relatedId || null,
              createdAt: this.parseDate(t.createdAt) || undefined,
              updatedAt: this.parseDate(t.updatedAt) || undefined,
            },
          });
        }
        imported.tasks = tasks.length;

        // Activities
        for (const a of activities) {
          if (!a.id || !a.type || !a.ownerId) continue;
          await tx.activity.create({
            data: {
              id: a.id,
              type: a.type as any,
              content: a.content || '',
              customerId: a.customerId || null,
              ownerId: a.ownerId,
              relatedType: a.relatedType || null,
              relatedId: a.relatedId || null,
              createdAt: this.parseDate(a.createdAt) || undefined,
            },
          });
        }
        imported.activities = activities.length;
      },
      { timeout: 5 * 60 * 1000 /* 5 min */ },
    );

    this.logger.log(
      `Restore complete: ${JSON.stringify(imported)}; skipped: ${skipped.join(', ') || 'none'}`,
    );

    return {
      imported,
      skipped,
      currentUserPreserved: !!currentUserId,
    };
  }

  /** deleteMany on a Prisma model that might not exist (older DBs). */
  private async safeDeleteAll(tx: any, modelName: string): Promise<void> {
    const m = tx[modelName];
    if (!m || typeof m.deleteMany !== 'function') return;
    try {
      await m.deleteMany();
    } catch (err: any) {
      // Swallow — the table may not have been migrated yet.
      this.logger.warn(`safeDeleteAll(${modelName}) skipped: ${err?.message}`);
    }
  }

  private parseDate(v: any): Date | null {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  private parseBool(v: any, def: boolean): boolean {
    if (v === true || v === false) return v;
    if (v === null || v === undefined || v === '') return def;
    const s = String(v).toLowerCase().trim();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return def;
  }

  private parseInt(v: any, def: number): number {
    if (v === null || v === undefined || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : def;
  }

  private parseDecimal(v: any): string | null {
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).trim();
    if (!s) return null;
    // Prisma accepts decimal as string.
    return s;
  }
}
