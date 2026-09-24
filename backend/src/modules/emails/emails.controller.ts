import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as path from 'path';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmailsService } from './emails.service';
import { EmailTrackingService } from './email-tracking.service';
import { SendEmailDto } from './dto/send-email.dto';
import { CreateTemplateDto } from './dto/create-template.dto';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign.dto';

/** RFC 5987 ext-value：encodeURIComponent 不转义的 ' ( ) * 也要转义。 */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

@ApiTags('邮件')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('emails')
export class EmailsController {
  constructor(
    private readonly emailsService: EmailsService,
    private readonly tracking: EmailTrackingService,
  ) {}

  // ==================== Email Account Config ====================

  @Get('accounts')
  async listAccounts(@CurrentUser() user: any) {
    return this.emailsService.listEmailAccounts(user.id);
  }

  @Get('accounts/:id')
  async getAccount(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.getEmailAccount(user.id, id);
  }

  @Post('accounts')
  async createAccount(@CurrentUser() user: any, @Body() body: any) {
    return this.emailsService.createEmailAccount(user.id, body);
  }

  @Put('accounts/:id')
  async updateAccount(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.emailsService.updateEmailAccount(user.id, id, body);
  }

  @Delete('accounts/:id')
  async deleteAccount(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.deleteEmailAccount(user.id, id);
  }

  @Post('accounts/:id/test')
  async testAccount(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.testEmailAccount(user.id, id);
  }

  @Post('accounts/:id/fetch')
  async fetchAccountEmails(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.emailsService.fetchEmails(user.id, id);
  }

  // 手动触发一次邮件活动时间戳修正（自动每小时执行一次）
  @Post('reconcile-activity-timestamps')
  async reconcileActivityTimestamps() {
    return this.emailsService.reconcileEmailActivityTimestamps();
  }

  // ==================== Tracking — Pixel ====================

  /**
   * Pixel open tracker. Public (no auth — the recipient's mail client
   * fetches this). Never fails — any error is swallowed so we still
   * serve the image (otherwise mail clients retry / report "broken image").
   *
   * Dedup, bot detection, and confidence updates happen inside
   * EmailTrackingService.recordOpen().
   */
  @Public()
  @Get('track/:id/pixel.png')
  async trackOpen(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // fire-and-forget so the image returns instantly
    this.tracking.recordOpen(id, req).catch(() => {});

    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': TRACKING_PIXEL.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.end(TRACKING_PIXEL);
  }

  /**
   * Click tracker. Public. Records the click, then 302s to the original URL.
   * Requires a valid HMAC token (t=) — otherwise the user gets a 400 rather
   * than redirecting anywhere, which prevents the endpoint from being used
   * as an open-redirect.
   */
  @Public()
  @Get('track/:id/click/:linkId')
  async trackClick(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @Query('t') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const url = await this.tracking.recordClick(id, linkId, token, req);
    if (!url) {
      res.status(400).send('Invalid or expired tracking link');
      return;
    }
    res.redirect(302, url);
  }

  /**
   * Full tracking report for a single email — all opens + clicks +
   * rewritten link list + confidence score. Gated by the usual auth.
   */
  @Get(':id/tracking')
  async getTracking(@CurrentUser() user: any, @Param('id') id: string) {
    await this.emailsService.ensureCanRead(id, user);
    return this.tracking.getTrackingDetail(id);
  }

  // ==================== Per-account Signature ====================

  @Get('accounts/:id/signature')
  async getSignature(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.emailsService.getAccountSignature(user.id, id);
  }

  @Put('accounts/:id/signature')
  async updateSignature(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { signature: string },
  ) {
    return this.emailsService.updateAccountSignature(
      user.id,
      id,
      body?.signature ?? '',
    );
  }

  // ==================== Campaigns ====================

  @Get('campaigns')
  async listCampaigns(@CurrentUser() user: any) {
    return this.emailsService.listCampaigns(user.id, user.role);
  }

  @Post('campaigns')
  async createCampaign(
    @CurrentUser() user: any,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.emailsService.createCampaign(user.id, dto);
  }

  @Put('campaigns/:id')
  async updateCampaign(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.emailsService.updateCampaign(id, user.id, user.role, dto);
  }

  @Delete('campaigns/:id')
  async deleteCampaign(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.emailsService.deleteCampaign(id, user.id, user.role);
  }

  /** Aggregate stats: sent / opened / opened-by-human / clicked / open rate. */
  @Get('campaigns/:id/stats')
  async campaignStats(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.getCampaignStats(id, user);
  }

  // ==================== Recipients ====================

  @Get('recipients')
  async listRecipients(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.emailsService.listRecipients(user, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('recipients/:id')
  async getRecipient(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.getRecipientDetail(id, user);
  }

  /**
   * 收件人地址自动补全。合并：已发过的 EmailRecipient、收到过的 INBOUND
   * 邮件发件人、CRM 联系人。按最近活跃时间排序。
   */
  @Get('address-suggestions')
  async suggestAddresses(
    @CurrentUser() user: any,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.emailsService.suggestAddresses(
      user,
      q || '',
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * "收件人已读"铃铛通知：列出当前用户发出、已被阅读、且时间晚于 since
   * 的邮件。前端把上次确认过的时间传进来即可（存 localStorage）。
   */
  @Get('open-notifications')
  async openNotifications(
    @CurrentUser() user: any,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    return this.emailsService.listOpenNotifications(
      user.id,
      since ? new Date(since) : null,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  // ==================== Email Operations ====================

  @Post('send')
  async sendEmail(
    @CurrentUser() user: any,
    @Body() dto: SendEmailDto,
    @Req() req: Request,
  ) {
    // Picks APP_URL env, else the real browser-facing origin (via Referer
    // / X-Forwarded-Host). Avoids leaking docker-internal "backend:3001"
    // into tracking URLs that recipients' mail clients need to reach.
    const origin = this.tracking.resolveTrackingOrigin(req);
    return this.emailsService.sendEmail(user.id, dto, origin);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    return this.emailsService.getUnreadCount(user.id, user.role);
  }

  @Get('recently-viewed')
  async getRecentlyViewed(@CurrentUser() user: any) {
    return this.emailsService.getRecentlyViewed(user.id, user.role);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('direction') direction?: string,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('grouped') grouped?: string,
    @Query('emailConfigId') emailConfigId?: string,
    @Query('category') category?: string,
    @Query('flagged') flagged?: string,
    @Query('search') search?: string,
  ) {
    return this.emailsService.findAll(
      user.id,
      user.role,
      {
        customerId,
        direction,
        status,
        page,
        pageSize,
        grouped,
        emailConfigId,
        category,
        flagged,
        search,
      },
      !!user.isSuperAdmin,
    );
  }

  // ==================== Flag/Category ====================

  @Patch(':id/flag')
  async toggleFlag(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { flagged: boolean },
  ) {
    return this.emailsService.toggleFlag(id, user, body.flagged);
  }

  @Patch(':id/category')
  async updateCategory(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { category: string },
  ) {
    return this.emailsService.updateCategory(id, user, body.category);
  }

  // ==================== Delete / Trash / Spam ====================

  @Delete(':id')
  async deleteEmail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.moveToTrash(id, user);
  }

  @Post('batch-trash')
  async batchTrash(@CurrentUser() user: any, @Body() body: { ids: string[] }) {
    return this.emailsService.batchMoveToTrash(body?.ids, user);
  }

  @Post(':id/restore')
  async restoreEmail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.restoreFromTrash(id, user);
  }

  @Delete(':id/permanent')
  async permanentDeleteEmail(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.permanentDelete(id, user);
  }

  // 只清空 / 扫描调用者自己邮箱里的邮件
  @Delete('trash/empty')
  async emptyTrash(@CurrentUser() user: any) {
    return this.emailsService.emptyTrash(user.id);
  }

  @Post('scan-spam')
  async scanSpam(@CurrentUser() user: any) {
    return this.emailsService.scanSpam(user.id);
  }

  // ==================== Templates ====================

  @Get('templates')
  async findAllTemplates() {
    return this.emailsService.findAllTemplates();
  }

  @Post('templates')
  async createTemplate(
    @CurrentUser() user: any,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.emailsService.createTemplate(dto, user);
  }

  @Put('templates/:id')
  async updateTemplate(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.emailsService.updateTemplate(id, dto, user);
  }

  @Delete('templates/:id')
  async deleteTemplate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.deleteTemplate(id, user);
  }

  // ==================== Thread & Detail ====================

  @Get('threads/:threadId')
  async findThreadEmails(
    @CurrentUser() user: any,
    @Param('threadId') threadId: string,
  ) {
    return this.emailsService.findThreadEmails(threadId, user);
  }

  // 附件懒下载：收邮件时只落元数据，用户点"下载"才按需从 IMAP 回源
  // 抓取；首次下载后落盘缓存，后续直接磁盘返回。
  @Get('attachments/:attachmentId/download')
  async downloadAttachment(
    @CurrentUser() user: any,
    @Param('attachmentId') attachmentId: string,
    @Res() res: Response,
  ) {
    const { filePath, fileName, mimeType } =
      await this.emailsService.downloadAttachment(attachmentId, user);
    // filename 给老客户端一个 ASCII 兜底，filename* 按 RFC 5987 带真实
    // 文件名。以前 filename="%E6%8A%A5..." 会让中文文件名下载后变成编码串。
    const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeRfc5987(fileName)}`,
    );
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.sendFile(path.resolve(filePath));
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.findOne(id, user);
  }

  @Patch('mark-all-read')
  async markAllAsRead(@CurrentUser() user: any) {
    return this.emailsService.markAllAsRead(user.id, user.role);
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.markAsRead(id, user);
  }

  @Post('fetch')
  async fetchAllEmails(@CurrentUser() user: any) {
    return this.emailsService.fetchAllAccounts(user.id);
  }
}
