import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FollowUpsService } from './follow-ups.service';

@Controller('follow-ups')
@UseGuards(JwtAuthGuard)
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  /** 小接口给侧栏数字角标 / banner 用：{pending, overdue} */
  @Get('summary')
  summary(@CurrentUser() user: any) {
    return this.followUpsService.summary(user.id);
  }

  /** 管理员团队概览 */
  @Get('admin/overview')
  adminOverview(@CurrentUser() user: any) {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可查看团队跟进概览');
    }
    return this.followUpsService.adminOverview();
  }

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('ownerId') ownerId?: string,
    @Query('status') status?: any,
    @Query('overdueOnly') overdueOnly?: string,
    @Query('leadId') leadId?: string,
  ) {
    return this.followUpsService.list(
      {
        ownerId,
        status,
        overdueOnly: overdueOnly === 'true' || overdueOnly === '1',
        leadId,
      },
      user.id,
      user.role,
    );
  }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body() body: { leadId: string; dueAt: string; notes?: string; ownerId?: string },
  ) {
    return this.followUpsService.createManual(body, user.id, user.role);
  }

  @Patch(':id/done')
  done(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.followUpsService.markDone(id, user.id, user.role, body?.notes);
  }

  @Patch(':id/snooze')
  snooze(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { days: number },
  ) {
    return this.followUpsService.snooze(id, Number(body?.days), user.id, user.role);
  }

  @Patch(':id/dismiss')
  dismiss(@CurrentUser() user: any, @Param('id') id: string) {
    return this.followUpsService.dismiss(id, user.id, user.role);
  }

  @Patch(':id/reassign')
  reassign(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { ownerId: string },
  ) {
    return this.followUpsService.reassign(id, body?.ownerId, user.id, user.role);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.followUpsService.remove(id, user.id, user.role);
  }
}
