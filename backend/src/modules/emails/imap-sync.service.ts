import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { simpleParser, ParsedMail } from 'mailparser';
import { PrismaService } from '../../prisma/prisma.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { QUEUE_EMAIL, EMAIL_JOB_FETCH } from '../../queue/queue.constants';
import { EmailCustomerMatcher } from './email-customer-matcher.service';
import { isSpam, makeSnippet } from './email-utils';
import {
  ImapAccount,
  fetchByUid,
  findSentFolder,
  openBox,
  parseMessageIdHeader,
  searchUids,
  withImap,
} from './imap-utils';

export interface SyncResult {
  fetched: number;
  inboxFetched: number;
  sentFetched: number;
  sentFolder: string | null;
  /** 解析 / 入库失败、被跳过的邮件数 */
  failed: number;
}

interface AccountCtx extends ImapAccount {
  id: string;
  userId: string;
  emailAddr: string;
}

// 每批先只取这么多封邮件的 Message-ID，挑出库里没有的再拉正文
const HEADER_BATCH = 500;
// 整封原文每批拉取数：原文含附件，批太大会占内存
const BODY_BATCH = 20;
// 新账户首次同步回溯多少天（0 = 全部历史）
const INITIAL_SYNC_DAYS = (() => {
  const v = parseInt(process.env.EMAIL_INITIAL_SYNC_DAYS || '90', 10);
  return Number.isFinite(v) && v >= 0 ? v : 90;
})();
// 游标失效（老数据升级 / UIDVALIDITY 变化）时，从库里最新一封往前回看的天数
const RESCAN_BUFFER_MS = 7 * 24 * 60 * 60 * 1000;
// 没有队列（Redis 不可用）时，本进程内同时同步的账户数
const INLINE_CONCURRENCY = 3;
// "已发送"文件夹名缓存时长
const SENT_FOLDER_TTL_MS = 60 * 60 * 1000;

/**
 * IMAP 收信同步。
 *
 * 以前：每分钟对每个账户 SEARCH SINCE(最近一封 - 7 天)，把这 7 天的
 * 邮件整封（含附件）全部下载、解析一遍，再靠 Message-ID 在库里去重。
 * 现在：
 *   - 每个文件夹记住 UIDVALIDITY + 已同步到的最大 UID，只拉新 UID；
 *     没有新邮件时只有一次登录 + EXAMINE，不下载任何内容。
 *   - 需要按时间窗口扫描时（新账户、升级后第一次、UIDVALIDITY 变了），
 *     先批量只取 Message-ID，库里已有的跳过，只下载真正的新邮件。
 *   - 分批处理，每批结束推进游标；中途失败下次从断点继续。
 *   - 每个账户是一个 BullMQ 任务（jobId 去重，多实例部署也不会重复收）；
 *     连续失败的账户按指数退避，不再每分钟去撞错误的密码。
 *   - 连接空闲超时会真正断开连接（见 withImap）。
 */
@Injectable()
export class ImapSyncService {
  private readonly logger = new Logger(ImapSyncService.name);
  // 同一账户同时只跑一个同步；手动"收取"和后台任务撞上时共用同一个 Promise
  private readonly inFlight = new Map<string, Promise<SyncResult>>();
  private readonly sentFolderCache = new Map<string, { folder: string | null; at: number }>();
  private scheduling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly followUps: FollowUpsService,
    private readonly matcher: EmailCustomerMatcher,
    @Optional()
    @InjectQueue(QUEUE_EMAIL)
    private readonly emailQueue?: Queue,
  ) {}

  // ==================== 调度 ====================

  /**
   * 每分钟给每个到期的账户投递一个同步任务。jobId 固定为
   * fetch-{账户 id}：上一个还没跑完时不会重复投递。
   */
  @Cron('*/1 * * * *')
  async scheduleSync(): Promise<void> {
    if (this.scheduling) return;
    this.scheduling = true;
    try {
      const configs = await this.prisma.emailConfig.findMany({
        select: { id: true, syncFailCount: true, lastSyncAttemptAt: true },
      });
      const due = configs.filter((c) => this.isDue(c));
      if (this.emailQueue) {
        for (const c of due) {
          await this.emailQueue
            .add(
              EMAIL_JOB_FETCH,
              { configId: c.id },
              {
                jobId: `fetch-${c.id}`,
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: true,
              },
            )
            .catch((e) => this.logger.warn(`enqueue sync ${c.id} failed: ${e?.message}`));
        }
      } else {
        await this.runWithConcurrency(due, INLINE_CONCURRENCY, (c) =>
          this.syncAccount(c.id).then(
            () => undefined,
            () => undefined,
          ),
        );
      }
    } catch (err: any) {
      this.logger.error(`scheduleSync error: ${err?.message || err}`);
    } finally {
      this.scheduling = false;
    }
  }

  /** 连续失败 n 次后，等 min(2^(n-1), 30) 分钟再试。 */
  private isDue(c: { syncFailCount: number; lastSyncAttemptAt: Date | null }): boolean {
    if (!c.syncFailCount || !c.lastSyncAttemptAt) return true;
    const waitMin = Math.min(2 ** (c.syncFailCount - 1), 30);
    return Date.now() - c.lastSyncAttemptAt.getTime() >= waitMin * 60_000;
  }

  // ==================== 单账户同步 ====================

  syncAccount(configId: string): Promise<SyncResult> {
    const running = this.inFlight.get(configId);
    if (running) return running;
    const p = this.doSyncAccount(configId).finally(() => this.inFlight.delete(configId));
    this.inFlight.set(configId, p);
    return p;
  }

  private async doSyncAccount(configId: string): Promise<SyncResult> {
    const config = await this.prisma.emailConfig.findUnique({ where: { id: configId } });
    if (!config) throw new Error('Email configuration not found');
    const ctx: AccountCtx = config;

    await this.prisma.emailConfig.update({
      where: { id: configId },
      data: { lastSyncAttemptAt: new Date() },
    });

    try {
      const result = await withImap(ctx, async (imap, touch) => {
        const inbox = await this.syncFolder(imap, touch, ctx, 'INBOX', 'INBOUND');
        const sentFolder = await this.getSentFolder(imap, configId);
        let sent = { fetched: 0, failed: 0 };
        if (sentFolder) {
          try {
            sent = await this.syncFolder(imap, touch, ctx, sentFolder, 'OUTBOUND');
          } catch (err: any) {
            // 已发送文件夹出错不影响收件箱结果
            this.logger.warn(`[${ctx.emailAddr}] sync ${sentFolder} failed: ${err?.message}`);
          }
        }
        return {
          fetched: inbox.fetched + sent.fetched,
          inboxFetched: inbox.fetched,
          sentFetched: sent.fetched,
          sentFolder,
          failed: inbox.failed + sent.failed,
        };
      });

      await this.prisma.emailConfig.update({
        where: { id: configId },
        data: {
          lastSyncAt: new Date(),
          syncFailCount: 0,
          lastSyncError: result.failed > 0 ? `${result.failed} 封邮件解析或保存失败，已跳过` : null,
        },
      });
      if (result.fetched > 0) {
        this.logger.log(`[${ctx.emailAddr}] synced ${result.fetched} new email(s)`);
      }
      return result;
    } catch (err: any) {
      const message = String(err?.message || err).slice(0, 500);
      await this.prisma.emailConfig
        .update({
          where: { id: configId },
          data: { lastSyncError: message, syncFailCount: { increment: 1 } },
        })
        .catch(() => undefined);
      this.logger.warn(`[${ctx.emailAddr}] sync failed: ${message}`);
      throw err;
    }
  }

  private async getSentFolder(imap: any, configId: string): Promise<string | null> {
    const cached = this.sentFolderCache.get(configId);
    if (cached && Date.now() - cached.at < SENT_FOLDER_TTL_MS) return cached.folder;
    const folder = await findSentFolder(imap, this.logger);
    this.sentFolderCache.set(configId, { folder, at: Date.now() });
    return folder;
  }

  // ==================== 单文件夹同步 ====================

  private async syncFolder(
    imap: any,
    touch: () => void,
    ctx: AccountCtx,
    folder: string,
    direction: 'INBOUND' | 'OUTBOUND',
  ): Promise<{ fetched: number; failed: number }> {
    const box = await openBox(imap, folder, true);
    touch();
    const uidValidity = String(box.uidvalidity ?? '');
    const uidNext = Number(box.uidnext) || 0;

    const state = await this.prisma.emailSyncState.findUnique({
      where: { emailConfigId_folder: { emailConfigId: ctx.id, folder } },
    });

    let uids: number[];
    let lastUid = 0;
    if (state && uidValidity && state.uidValidity === uidValidity) {
      lastUid = Number(state.lastUid);
      // 没有新邮件：连 SEARCH 都不用发
      if (uidNext && uidNext - 1 <= lastUid) return { fetched: 0, failed: 0 };
      // 注意 "n:*" 在没有 >= n 的 UID 时也会返回最大那封，要再过滤一次
      uids = (await searchUids(imap, [['UID', `${lastUid + 1}:*`]])).filter((u) => u > lastUid);
    } else {
      const since = await this.rescanSince(ctx.id, direction);
      uids = await searchUids(imap, since ? [['SINCE', since]] : ['ALL']);
      if (state) {
        this.logger.log(`[${ctx.emailAddr}] ${folder} UIDVALIDITY changed, rescanning`);
      }
    }
    touch();

    let fetched = 0;
    let failed = 0;
    for (let i = 0; i < uids.length; i += HEADER_BATCH) {
      const chunk = uids.slice(i, i + HEADER_BATCH);

      // 1) 只取 Message-ID，找出库里还没有的
      const headers = await fetchByUid(imap, chunk, 'HEADER.FIELDS (MESSAGE-ID)', touch);
      const idByUid = new Map(headers.map((h) => [h.uid, parseMessageIdHeader(h.data)]));
      const ids = [...idByUid.values()].filter((v): v is string => !!v);
      const existing = ids.length
        ? await this.prisma.email.findMany({
            where: { emailConfigId: ctx.id, messageId: { in: ids } },
            select: { messageId: true },
          })
        : [];
      const have = new Set(existing.map((e) => e.messageId));
      const toFetch = chunk.filter((uid) => {
        const mid = idByUid.get(uid);
        return !mid || !have.has(mid);
      });

      // 2) 只下载新邮件的完整原文，按 UID 顺序逐封入库（保证同批里
      //    回复能挂到前面的原邮件线程上）
      for (let j = 0; j < toFetch.length; j += BODY_BATCH) {
        const sub = toFetch.slice(j, j + BODY_BATCH);
        const raws = await fetchByUid(imap, sub, '', touch);
        for (const raw of raws) {
          try {
            const parsed = await simpleParser(raw.data);
            const created = await this.ingest(ctx, parsed, raw.uid, folder, direction);
            if (created) fetched++;
          } catch (err: any) {
            failed++;
            this.logger.warn(
              `[${ctx.emailAddr}] ${folder} uid ${raw.uid} ingest failed: ${err?.message}`,
            );
          }
          touch();
        }
      }

      // 3) 推进游标：本批最大 UID
      lastUid = Math.max(lastUid, chunk[chunk.length - 1]);
      await this.saveCursor(ctx.id, folder, uidValidity, lastUid);
    }

    // 时间窗口扫描时，窗口之外的老邮件不需要再看：游标直接推到打开
    // 文件夹时的 UIDNEXT-1（之后到的新邮件 UID 一定 >= 这个 UIDNEXT）。
    if (uidValidity && uidNext && uidNext - 1 > lastUid) {
      lastUid = uidNext - 1;
      await this.saveCursor(ctx.id, folder, uidValidity, lastUid);
    } else if (uidValidity && (!state || state.uidValidity !== uidValidity) && uids.length === 0) {
      await this.saveCursor(ctx.id, folder, uidValidity, lastUid);
    }

    return { fetched, failed };
  }

  /**
   * 没有可用游标时的扫描起点：库里该方向最新一封往前 7 天；库里没有就
   * 回溯 EMAIL_INITIAL_SYNC_DAYS 天（0 表示全部历史）。
   */
  private async rescanSince(configId: string, direction: 'INBOUND' | 'OUTBOUND'): Promise<Date | null> {
    const last = await this.prisma.email.findFirst({
      where: { emailConfigId: configId, direction },
      orderBy:
        direction === 'INBOUND'
          ? [{ receivedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
          : [{ sentAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { receivedAt: true, sentAt: true, createdAt: true },
    });
    if (last) {
      const t = (last.receivedAt || last.sentAt || last.createdAt).getTime();
      return new Date(t - RESCAN_BUFFER_MS);
    }
    if (INITIAL_SYNC_DAYS === 0) return null;
    return new Date(Date.now() - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000);
  }

  private async saveCursor(configId: string, folder: string, uidValidity: string, lastUid: number) {
    if (!uidValidity) return;
    await this.prisma.emailSyncState.upsert({
      where: { emailConfigId_folder: { emailConfigId: configId, folder } },
      create: { emailConfigId: configId, folder, uidValidity, lastUid: BigInt(lastUid) },
      update: { uidValidity, lastUid: BigInt(lastUid) },
    });
  }

  // ==================== 单封入库 ====================

  /** 返回 true 表示新建了一封邮件，false 表示已存在被跳过。 */
  private async ingest(
    ctx: AccountCtx,
    parsed: ParsedMail,
    uid: number,
    folder: string,
    direction: 'INBOUND' | 'OUTBOUND',
  ): Promise<boolean> {
    const messageId = parsed.messageId || null;
    const fromAddr = parsed.from?.value?.[0]?.address || 'unknown';
    const fromName = parsed.from?.value?.[0]?.name || null;
    // to / cc 带显示名存，前端能显示 "Tom Harvey" 而不是裸地址
    const fmtAddr = (v: { name?: string; address?: string }) =>
      v.name ? `${v.name} <${v.address}>` : v.address || '';
    const toList = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];
    const ccList = Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : [];
    const toValues = toList.flatMap((a) => a.value);
    const ccValues = ccList.flatMap((a) => a.value);
    const toAddr = toValues.map(fmtAddr).join(', ');
    const ccAddr = ccValues.map(fmtAddr).join(', ') || null;

    const matchEmail = direction === 'INBOUND' ? fromAddr : toValues[0]?.address || '';
    const customer = matchEmail ? await this.matcher.match(matchEmail) : null;

    const status = direction === 'INBOUND' ? 'RECEIVED' : 'SENT';
    let category = 'inbox';
    if (direction === 'INBOUND' && isSpam({ subject: parsed.subject, fromAddr, bodyText: parsed.text })) {
      category = 'spam';
    } else if (customer) {
      category = 'customer';
    } else if (direction === 'OUTBOUND') {
      category = 'sent';
    }

    const rawSubject = parsed.subject || '(No Subject)';
    const bodyHtml = parsed.html || null;
    const bodyText = parsed.text || null;

    // 按回复链（In-Reply-To / References）归线程，不按主题
    const threadId =
      (await this.findThreadByReplyHeaders(ctx.id, parsed.inReplyTo, parsed.references)) ||
      (await this.createThread(rawSubject));

    let newEmail;
    try {
      newEmail = await this.prisma.email.create({
        data: {
          messageId,
          fromAddr,
          fromName,
          toAddr,
          cc: ccAddr,
          subject: rawSubject,
          bodyHtml,
          bodyText,
          snippet: makeSnippet(bodyText, bodyHtml),
          direction,
          status,
          category,
          sentAt: direction === 'OUTBOUND' ? parsed.date || new Date() : null,
          receivedAt: direction === 'INBOUND' ? parsed.date || new Date() : null,
          customerId: customer?.id || null,
          senderId: ctx.userId,
          emailConfigId: ctx.id,
          threadId,
        },
      });
    } catch (e: any) {
      // 同一 Message-ID 已入库（并发同步 / 服务器上有重复副本）
      if (e?.code === 'P2002') return false;
      throw e;
    }

    // 回邮自动关闭跟进：In-Reply-To / References 命中 PENDING 跟进的触发邮件
    if (direction === 'INBOUND') {
      await this.followUps.resolveOnInboundEmail({
        inReplyTo: parsed.inReplyTo as string | undefined,
        references: parsed.references as string | string[] | undefined,
        fromAddr,
      });
    }

    // 附件只落元数据；用户点下载时再按 UID 回源 IMAP
    if (parsed.attachments?.length) {
      const rows = parsed.attachments.map((a: any) => ({
        emailId: newEmail.id,
        fileName: a.filename || a.cid || `attachment-${Date.now()}`,
        mimeType: a.contentType || 'application/octet-stream',
        size: Number(a.size) || (a.content?.length ?? 0),
        contentId: a.cid || null,
        isInline: a.contentDisposition === 'inline',
        imapUid: uid,
        imapFolder: folder,
      }));
      await this.prisma.emailAttachment.createMany({ data: rows }).catch((e: any) => {
        this.logger.warn(`Failed to save attachments metadata for email ${newEmail.id}: ${e.message}`);
      });
    }

    if (customer) {
      const senderLabel = fromName ? `${fromName} (${fromAddr})` : fromAddr;
      const content =
        direction === 'INBOUND'
          ? `收到邮件 - 发件人: ${senderLabel}，主题: ${parsed.subject || '(无主题)'}`
          : `发送邮件 - 收件人: ${toAddr}，主题: ${parsed.subject || '(无主题)'}`;
      // 用邮件实际收发时间作为活动时间，避免历史邮件都挤在同步那一刻
      await this.prisma.activity
        .create({
          data: {
            type: 'EMAIL',
            content,
            customerId: customer.id,
            ownerId: ctx.userId,
            relatedType: 'email',
            relatedId: newEmail.id,
            createdAt: parsed.date || new Date(),
          },
        })
        .catch(() => undefined);
    }

    return true;
  }

  private async createThread(subject: string): Promise<string> {
    const normalized =
      subject.replace(/^((re|fwd|fw|回复|转发)\s*[:：]\s*)+/gi, '').trim() || '(No Subject)';
    const thread = await this.prisma.emailThread.create({ data: { subject: normalized } });
    return thread.id;
  }

  /** 在同一邮箱账户内按 In-Reply-To / References 找父邮件的线程。 */
  private async findThreadByReplyHeaders(
    emailConfigId: string,
    inReplyTo?: string | null,
    references?: string | string[] | null,
  ): Promise<string | null> {
    const ids: string[] = [];
    if (inReplyTo) ids.push(inReplyTo);
    for (const r of Array.isArray(references) ? references : references ? [references] : []) {
      if (r && !ids.includes(r)) ids.push(r);
    }
    if (ids.length === 0) return null;
    const parent = await this.prisma.email.findFirst({
      where: { emailConfigId, messageId: { in: ids } },
      select: { threadId: true },
      orderBy: { createdAt: 'desc' },
    });
    return parent?.threadId || null;
  }

  private async runWithConcurrency<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    });
    await Promise.all(runners);
  }
}
