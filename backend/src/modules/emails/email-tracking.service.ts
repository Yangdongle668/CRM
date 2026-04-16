import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export type OpenKind = 'HUMAN' | 'PROXY' | 'PREFETCH' | 'BOT' | 'DUP';

const BOT_UA_RE = /(bot|crawler|spider|curl|wget|python-requests|go-http-client|googlebot|bingbot|yandex|duckduckbot|slackbot|linkcheck|headlesschrome|puppeteer)/i;
const PROXY_UA_RE = /(GoogleImageProxy|YahooMailProxy|ymailproxy)/i;
const PREFETCH_UA_RE =
  /(Mail\/[\d.]+ CFNetwork|iOS Mail|Apple Mail|AppleMail|AOL |Office.*Outlook.*\b(Prefetch|Preview)\b|Microsoft.*Prefetch|MimecastMTA|Proofpoint|Barracuda|mimecast|messagelabs)/i;
const DEDUP_WINDOW_MS = 5000;

/**
 * Single source of truth for email open / click tracking.
 *
 * Responsibilities:
 *   - Classify a user-agent string (HUMAN / PROXY / PREFETCH / BOT).
 *   - Issue + verify HMAC tokens for click URLs.
 *   - Rewrite outbound HTML: inject pixel + wrap every <a href>.
 *   - Dedup pixel hits (same IP+UA within 5 s = single event).
 *   - Persist open / click events, update the Email aggregate fields,
 *     and recompute the open-confidence score.
 */
@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name);
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.secret =
      this.config.get<string>('EMAIL_TRACKING_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      this.config.get<string>('jwt.secret') ||
      'trade-crm-tracking-fallback-secret';
  }

  // ---------- Classification ----------

  classifyUserAgent(ua?: string | null): OpenKind {
    if (!ua) return 'BOT';
    if (PROXY_UA_RE.test(ua)) return 'PROXY';
    if (PREFETCH_UA_RE.test(ua)) return 'PREFETCH';
    if (BOT_UA_RE.test(ua)) return 'BOT';
    return 'HUMAN';
  }

  extractIp(req: Request): string | null {
    const xf = req.headers?.['x-forwarded-for'];
    if (typeof xf === 'string' && xf) return xf.split(',')[0].trim();
    if (Array.isArray(xf) && xf.length) return xf[0];
    return (req.ip as string | undefined) || req.socket?.remoteAddress || null;
  }

  // ---------- HMAC token ----------

  /** Short HMAC over "<emailId>:<linkId>" — 16 hex chars is plenty vs. guessing. */
  signToken(emailId: string, linkId: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`${emailId}:${linkId}`)
      .digest('hex')
      .slice(0, 16);
  }

  verifyToken(emailId: string, linkId: string, token: string): boolean {
    if (!token) return false;
    const expected = this.signToken(emailId, linkId);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(token, 'hex'),
      );
    } catch {
      return false;
    }
  }

  // ---------- HTML rewriting ----------

  /**
   * Parse outbound HTML, persist a tracking link row for every <a href>
   * pointing at an absolute http(s) URL, and return rewritten HTML with:
   *   - every such <a href> replaced by a tracked redirect URL
   *   - a 1x1 tracking pixel appended to the body
   *
   * Idempotent: if the email already has link rows, they are reused.
   */
  async rewriteEmailHtml(
    emailId: string,
    html: string,
    appUrl: string,
  ): Promise<string> {
    if (!html) html = '';
    const base = (appUrl || '').replace(/\/$/, '');

    // ---- Rewrite links ----
    // Match <a ... href="..."> capturing the href value. Supports single
    // or double quotes. We deliberately don't try to parse arbitrary HTML
    // (regexes on HTML are infamous) — this heuristic is good enough for
    // the message bodies our users compose.
    const linkRe =
      /<a\b([^>]*?)\shref\s*=\s*(?:"([^"]+)"|'([^']+)')([^>]*)>/gi;

    const seen = new Map<string, string>(); // original URL → linkId
    let position = 0;
    const rowsToCreate: Array<{
      emailId: string;
      linkId: string;
      url: string;
      position: number;
    }> = [];

    const rewritten = html.replace(linkRe, (full, before, q1, q2, after) => {
      const original = (q1 || q2 || '').trim();
      if (!/^https?:\/\//i.test(original)) return full; // leave mailto:/anchor
      // Skip our own tracking URL (idempotent when called twice).
      if (
        base &&
        original.startsWith(`${base}/api/emails/track/`)
      ) {
        return full;
      }

      let linkId = seen.get(original);
      if (!linkId) {
        // Deterministic, short id — stable for same URL within one email.
        linkId = crypto
          .createHash('sha1')
          .update(`${emailId}::${position}::${original}`)
          .digest('hex')
          .slice(0, 10);
        seen.set(original, linkId);
        rowsToCreate.push({
          emailId,
          linkId,
          url: original,
          position: position++,
        });
      }

      const token = this.signToken(emailId, linkId);
      const trackedUrl = base
        ? `${base}/api/emails/track/${emailId}/click/${linkId}?t=${token}`
        : `/api/emails/track/${emailId}/click/${linkId}?t=${token}`;
      return `<a${before} href="${trackedUrl}"${after}>`;
    });

    if (rowsToCreate.length > 0) {
      // Persist link mappings. skipDuplicates handles idempotent re-runs.
      await this.prisma.emailLink.createMany({
        data: rowsToCreate,
        skipDuplicates: true,
      });
    }

    // ---- Append tracking pixel ----
    const pixelUrl = base
      ? `${base}/api/emails/track/${emailId}/pixel.png`
      : `/api/emails/track/${emailId}/pixel.png`;
    const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;border:0;max-width:1px;max-height:1px;" alt="" />`;
    return `${rewritten}${pixel}`;
  }

  // ---------- Record events ----------

  /**
   * Record a pixel hit. Returns the created event (or null if deduped).
   * Updates Email aggregates + recomputes the confidence score.
   */
  async recordOpen(
    emailId: string,
    req: Request,
  ): Promise<{ recorded: boolean; kind: OpenKind }> {
    const email = await this.prisma.email.findUnique({
      where: { id: emailId },
      select: {
        id: true,
        direction: true,
        viewedAt: true,
        viewCount: true,
        firstHumanOpenAt: true,
      },
    });
    if (!email || email.direction !== 'OUTBOUND') {
      return { recorded: false, kind: 'BOT' };
    }

    const ua = (req.headers['user-agent'] as string | undefined) || '';
    const ip = this.extractIp(req);
    const referer =
      (req.headers['referer'] as string | undefined) ||
      (req.headers['referrer'] as string | undefined) ||
      null;
    let kind: OpenKind = this.classifyUserAgent(ua);

    // Dedup: same emailId + UA + IP within the window → squash.
    const since = new Date(Date.now() - DEDUP_WINDOW_MS);
    const recent = await this.prisma.emailOpenEvent.findFirst({
      where: {
        emailId,
        ip: ip || undefined,
        userAgent: ua || undefined,
        openedAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) {
      // Still store the dup for forensic completeness — weighted 0 in confidence.
      await this.prisma.emailOpenEvent.create({
        data: {
          emailId,
          ip,
          userAgent: ua ? ua.slice(0, 500) : null,
          referer: referer ? referer.slice(0, 500) : null,
          kind: 'DUP',
          source: 'PIXEL',
        },
      });
      return { recorded: true, kind: 'DUP' };
    }

    await this.prisma.emailOpenEvent.create({
      data: {
        emailId,
        ip,
        userAgent: ua ? ua.slice(0, 500) : null,
        referer: referer ? referer.slice(0, 500) : null,
        kind,
        source: 'PIXEL',
      },
    });

    // Update aggregate fields on the Email row.
    const now = new Date();
    const isHuman = kind === 'HUMAN' || kind === 'PROXY';
    await this.prisma.email.update({
      where: { id: emailId },
      data: {
        viewedAt: email.viewedAt || now,
        lastOpenedAt: now,
        firstHumanOpenAt:
          isHuman && !email.firstHumanOpenAt ? now : email.firstHumanOpenAt,
        viewCount: { increment: 1 },
        // Only flip status → VIEWED for non-prefetch/bot hits, to avoid
        // showing "已读" when it's actually Apple MPP pre-download.
        ...(isHuman ? { status: 'VIEWED' as const } : {}),
      },
    });
    await this.updateConfidence(emailId);
    return { recorded: true, kind };
  }

  /** Record a click → returns the target URL (or null if token invalid). */
  async recordClick(
    emailId: string,
    linkId: string,
    token: string,
    req: Request,
  ): Promise<string | null> {
    if (!this.verifyToken(emailId, linkId, token)) return null;
    const link = await this.prisma.emailLink.findUnique({
      where: { emailId_linkId: { emailId, linkId } },
    });
    if (!link) return null;

    const ua = (req.headers['user-agent'] as string | undefined) || '';
    const ip = this.extractIp(req);
    const referer =
      (req.headers['referer'] as string | undefined) ||
      (req.headers['referrer'] as string | undefined) ||
      null;
    const kind = this.classifyUserAgent(ua);

    await this.prisma.emailClickEvent.create({
      data: {
        emailId,
        linkId,
        url: link.url,
        ip,
        userAgent: ua ? ua.slice(0, 500) : null,
        referer: referer ? referer.slice(0, 500) : null,
        kind,
      },
    });

    // Clicks imply the user saw the email — bump counters + confidence.
    const now = new Date();
    await this.prisma.email.update({
      where: { id: emailId },
      data: {
        totalClicks: { increment: 1 },
        lastOpenedAt: now,
        firstHumanOpenAt:
          kind === 'HUMAN' ? undefined : undefined, // we'll set below via aggregate
        viewedAt: undefined,
        status: kind === 'HUMAN' ? ('VIEWED' as const) : undefined,
      },
    });
    // If there's no prior human-open timestamp, use the click as proof.
    await this.prisma.email.updateMany({
      where: { id: emailId, firstHumanOpenAt: null },
      data: { firstHumanOpenAt: now },
    });
    if (kind === 'HUMAN' || kind === 'PROXY') {
      // Also log the click as an implicit open event so the open list is
      // complete even if the pixel was blocked.
      const recentOpen = await this.prisma.emailOpenEvent.findFirst({
        where: {
          emailId,
          ip: ip || undefined,
          userAgent: ua || undefined,
          openedAt: { gte: new Date(Date.now() - DEDUP_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (!recentOpen) {
        await this.prisma.emailOpenEvent.create({
          data: {
            emailId,
            ip,
            userAgent: ua ? ua.slice(0, 500) : null,
            referer: referer ? referer.slice(0, 500) : null,
            kind,
            source: 'CLICK_INFERRED',
          },
        });
      }
    }
    await this.updateConfidence(emailId);
    return link.url;
  }

  // ---------- Confidence ----------

  /**
   * Compute and persist the open-confidence score (0..1) for an email.
   *
   * Signals (all additive, clamped at [0, 1]):
   *   +0.30  any pixel load (incl. prefetch / proxy)         — weak
   *   +0.40  at least one HUMAN-class pixel hit               — medium
   *   +0.35  at least one link click (any kind)               — strong
   *   +0.10  ≥ 2 distinct open "sessions" (5-min windows)     — repeat read
   *   -0.20  every event is PREFETCH / BOT / PROXY only       — low-signal
   * Result is rounded to 2 decimals for stable UI.
   */
  async computeConfidence(emailId: string): Promise<number> {
    const [opens, clicks] = await Promise.all([
      this.prisma.emailOpenEvent.findMany({
        where: { emailId, kind: { not: 'DUP' } },
        select: { kind: true, openedAt: true },
      }),
      this.prisma.emailClickEvent.count({ where: { emailId } }),
    ]);

    let score = 0;
    if (opens.length > 0) score += 0.3;
    const anyHuman = opens.some((o) => o.kind === 'HUMAN' || o.kind === 'PROXY');
    if (anyHuman) score += 0.4;
    if (clicks > 0) score += 0.35;

    // Multi-session: group opens into 5-minute buckets.
    const bucketSize = 5 * 60 * 1000;
    const buckets = new Set(
      opens.map((o) => Math.floor(o.openedAt.getTime() / bucketSize)),
    );
    if (buckets.size >= 2) score += 0.1;

    const allLowSignal =
      opens.length > 0 &&
      !anyHuman &&
      clicks === 0 &&
      opens.every((o) => o.kind === 'PREFETCH' || o.kind === 'BOT');
    if (allLowSignal) score -= 0.2;

    const clamped = Math.max(0, Math.min(1, score));
    return Math.round(clamped * 100) / 100;
  }

  async updateConfidence(emailId: string): Promise<void> {
    const confidence = await this.computeConfidence(emailId);
    await this.prisma.email.update({
      where: { id: emailId },
      data: { openConfidence: confidence },
    });
  }

  // ---------- Query ----------

  async getTrackingDetail(emailId: string) {
    const [email, opens, clicks, links] = await Promise.all([
      this.prisma.email.findUnique({
        where: { id: emailId },
        select: {
          id: true,
          direction: true,
          status: true,
          sentAt: true,
          viewedAt: true,
          viewCount: true,
          firstHumanOpenAt: true,
          lastOpenedAt: true,
          totalClicks: true,
          openConfidence: true,
        },
      }),
      this.prisma.emailOpenEvent.findMany({
        where: { emailId, kind: { not: 'DUP' } },
        orderBy: { openedAt: 'desc' },
        take: 100,
      }),
      this.prisma.emailClickEvent.findMany({
        where: { emailId },
        orderBy: { clickedAt: 'desc' },
        take: 100,
      }),
      this.prisma.emailLink.findMany({
        where: { emailId },
        orderBy: { position: 'asc' },
      }),
    ]);
    return { email, opens, clicks, links };
  }
}
