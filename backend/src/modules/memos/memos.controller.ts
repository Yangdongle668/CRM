import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  MemosService,
  CreateMemoDto,
  UpdateMemoDto,
  CreateTimelineEntryDto,
} from './memos.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('memos')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MemosController {
  constructor(private readonly memosService: MemosService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('month') month?: string,
  ) {
    return this.memosService.findAll(user.id, { date, month });
  }

  /**
   * 客户跟进面板：返回所有 pinned=true 的备忘及其时间线。
   * 静态路由必须排在 :id 路由前面（虽然此控制器还没用到 :id，但提前防一手）。
   */
  @Get('pinned')
  findPinned(
    @CurrentUser() user: any,
    @Query('status') status?: string,
  ) {
    return this.memosService.findPinned(user.id, status);
  }

  @Get('range')
  getByDateRange(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.memosService.getByDateRange(user.id, startDate, endDate);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateMemoDto) {
    return this.memosService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateMemoDto,
  ) {
    return this.memosService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.memosService.remove(id, user.id);
  }

  // ==================== 时间线条目 ====================

  @Post(':id/timeline')
  addTimelineEntry(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: CreateTimelineEntryDto,
  ) {
    return this.memosService.addTimelineEntry(id, user.id, dto);
  }

  @Delete('timeline/:entryId')
  removeTimelineEntry(
    @CurrentUser() user: any,
    @Param('entryId') entryId: string,
  ) {
    return this.memosService.removeTimelineEntry(entryId, user.id);
  }
}
