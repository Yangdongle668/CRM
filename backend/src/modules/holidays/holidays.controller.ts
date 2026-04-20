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
  ParseIntPipe,
} from '@nestjs/common';
import { HolidaysService, HolidayDto } from './holidays.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Role } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('holidays')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  // Any authenticated user can read holidays for displaying on their calendar.
  @Get()
  list(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string, @Query('year') year?: string) {
    if (year) {
      return this.holidaysService.listByYear(parseInt(year, 10));
    }
    if (startDate && endDate) {
      return this.holidaysService.listByRange(startDate, endDate);
    }
    // Default: current + next year so the calendar always has data handy.
    const now = new Date().getUTCFullYear();
    return this.holidaysService.listByRange(`${now}-01-01`, `${now + 1}-12-31`);
  }

  @Get('years')
  @Roles(Role.ADMIN)
  years() {
    return this.holidaysService.listYearsWithData();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: HolidayDto) {
    return this.holidaysService.create(dto);
  }

  @Post('bulk/:year')
  @Roles(Role.ADMIN)
  bulkUpsert(@Param('year', ParseIntPipe) year: number, @Body() body: { items: HolidayDto[] }) {
    return this.holidaysService.bulkUpsert(year, body.items ?? []);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: Partial<HolidayDto>) {
    return this.holidaysService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.holidaysService.remove(id);
  }
}
