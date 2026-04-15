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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmailsService } from './emails.service';
import { SendEmailDto } from './dto/send-email.dto';
import { CreateTemplateDto } from './dto/create-template.dto';

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
  constructor(private readonly emailsService: EmailsService) {}

  // ==================== Email Account Config ====================

  @Get('accounts')
  async listAccounts(@CurrentUser() user: any) {
    return this.emailsService.listEmailAccounts(user.id);
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

  // ==================== Tracking Pixel ====================

  @Public()
  @Get('track/:id/pixel.png')
  async trackOpen(@Param('id') id: string, @Res() res: Response) {
    this.emailsService.recordView(id).catch(() => {});

    res.set({
      'Content-Type': 'image/gif',
      'Content-Length': TRACKING_PIXEL.length.toString(),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    res.end(TRACKING_PIXEL);
  }

  // ==================== Email Operations ====================

  @Post('send')
  async sendEmail(
    @CurrentUser() user: any,
    @Body() dto: SendEmailDto,
    @Req() req: Request,
  ) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    const origin = `${protocol}://${host}`;
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
  ) {
    return this.emailsService.findAll(user.id, user.role, {
      customerId,
      direction,
      status,
      page,
      pageSize,
      grouped,
      emailConfigId,
      category,
      flagged,
    });
  }

  // ==================== Flag/Category ====================

  @Patch(':id/flag')
  async toggleFlag(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { flagged: boolean },
  ) {
    return this.emailsService.toggleFlag(id, user.id, body.flagged);
  }

  @Patch(':id/category')
  async updateCategory(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { category: string },
  ) {
    return this.emailsService.updateCategory(id, user.id, body.category);
  }

  // ==================== Templates ====================

  @Get('templates')
  async findAllTemplates() {
    return this.emailsService.findAllTemplates();
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.emailsService.createTemplate(dto);
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.emailsService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    return this.emailsService.deleteTemplate(id);
  }

  // ==================== Thread & Detail ====================

  @Get('threads/:threadId')
  async findThreadEmails(
    @CurrentUser() user: any,
    @Param('threadId') threadId: string,
  ) {
    return this.emailsService.findThreadEmails(threadId, user.id, user.role);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.findOne(id, user.id, user.role);
  }

  @Patch('mark-all-read')
  async markAllAsRead(@CurrentUser() user: any) {
    return this.emailsService.markAllAsRead(user.id, user.role);
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.markAsRead(id, user.id, user.role);
  }

  @Post('fetch')
  async fetchAllEmails(@CurrentUser() user: any) {
    return this.emailsService.fetchAllAccounts(user.id);
  }
}
