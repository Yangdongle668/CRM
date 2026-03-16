import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
