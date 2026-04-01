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
import { MemosService } from './memos.service';
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

  @Get('range')
  getByDateRange(
    @CurrentUser() user: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.memosService.getByDateRange(user.id, startDate, endDate);
  }

  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: { title: string; content?: string; color?: string; date?: string },
  ) {
    return this.memosService.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: { title?: string; content?: string; color?: string; date?: string },
  ) {
    return this.memosService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.memosService.remove(id, user.id);
  }
}
