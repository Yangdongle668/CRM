import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  getStats(@CurrentUser() user: any) {
    return this.dashboardService.getStats(user.id, user.role);
  }

  /**
   * 服务器时间诊断：把服务器当前时间 / 时区 / 偏移量一起吐出来，
   * 前端可以拿来跟客户端本地时间对比，排查"发件时间比实际晚 X 分钟"
   * 之类的时钟漂移问题（宿主机 NTP 没同步时常见）。
   */
  @Get('time')
  getServerTime() {
    const now = new Date();
    return {
      serverTime: now.toISOString(),
      epochMs: now.getTime(),
      tz:
        process.env.TZ ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'UTC',
      tzOffsetMinutes: -now.getTimezoneOffset(),
    };
  }

  @Get('sales-trend')
  getSalesTrend(@CurrentUser() user: any) {
    return this.dashboardService.getSalesTrend(user.id, user.role);
  }

  @Get('funnel')
  getFunnel(@CurrentUser() user: any) {
    return this.dashboardService.getFunnel(user.id, user.role);
  }

  @Get('rankings')
  getRankings(@CurrentUser() user: any) {
    return this.dashboardService.getRankings(user.id, user.role);
  }

  @Get('admin/overview')
  getAdminOverview(
    @CurrentUser() user: any,
    @Query('period') period?: string,
  ) {
    return this.dashboardService.getAdminOverview(user.role, period || 'month');
  }

  @Get('admin/salesperson-stats')
  getSalespersonStats(
    @CurrentUser() user: any,
    @Query('period') period?: string,
  ) {
    return this.dashboardService.getSalespersonStats(
      user.role,
      period || 'month',
    );
  }

  @Get('admin/follow-up-progress')
  getFollowUpProgress(@CurrentUser() user: any) {
    return this.dashboardService.getFollowUpProgress(user.role);
  }

  @Get('admin/trend')
  getAdminTrend(
    @CurrentUser() user: any,
    @Query('granularity') granularity?: 'day' | 'month',
    @Query('days') days?: string,
  ) {
    return this.dashboardService.getTrend(
      user.role,
      granularity || 'day',
      days ? parseInt(days) : 30,
    );
  }
}
