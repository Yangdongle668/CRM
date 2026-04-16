import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import {
  QUEUE_BACKUP,
  BACKUP_JOB_EXPORT,
} from '../../queue/queue.constants';

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
      { jobId: `export:${Date.now()}` },
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
}
