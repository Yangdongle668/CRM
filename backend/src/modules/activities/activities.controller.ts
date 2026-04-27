import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.activitiesService.findAll(
      user.id,
      user.role,
      query,
      !!user.isSuperAdmin,
    );
  }

  @Get('customer/:customerId')
  findByCustomerId(
    @CurrentUser() user: any,
    @Param('customerId') customerId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.activitiesService.findByCustomerId(
      customerId,
      user.id,
      user.role,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
      !!user.isSuperAdmin,
    );
  }
}
