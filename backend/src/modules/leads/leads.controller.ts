import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { LeadsService } from './leads.service';
import { CreateLeadDto, LeadStage } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
import {
  BatchActionDto,
  CreateLeadActivityDto,
  AssignLeadDto,
} from './dto/batch-action.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IsEnum, IsNotEmpty } from 'class-validator';

class UpdateStageDto {
  @IsEnum(LeadStage)
  @IsNotEmpty()
  stage: LeadStage;
}

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  findAll(
    @Query() query: QueryLeadDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.findAll(query, user.id, user.role);
  }

  @Get('export/csv')
  async exportCsv(
    @Query() query: QueryLeadDto,
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
  ) {
    const csv = await this.leadsService.exportCsv(query, user.id, user.role);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="leads-${Date.now()}.csv"`,
    );
    res.send(csv);
  }

  @Post('batch-assign')
  batchAssign(
    @Body() dto: BatchActionDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.batchAssign(dto.ids, dto.ownerId!, user.role);
  }

  @Post('batch-release')
  batchRelease(
    @Body() dto: BatchActionDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.batchRelease(dto.ids, user.id, user.role);
  }

  @Post('batch-delete')
  batchDelete(
    @Body() dto: BatchActionDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.batchDelete(dto.ids, user.id, user.role);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.findOne(id, user.id, user.role);
  }

  @Get(':id/activities')
  listActivities(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.listActivities(id, user.id, user.role);
  }

  @Post(':id/activities')
  addActivity(
    @Param('id') id: string,
    @Body() dto: CreateLeadActivityDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.addActivity(id, dto.content, user.id, user.role);
  }

  @Post()
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.create(dto, user.id, user.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.update(id, dto, user.id, user.role);
  }

  @Patch(':id/stage')
  updateStage(
    @Param('id') id: string,
    @Body() dto: UpdateStageDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.updateStage(id, dto.stage, user.id, user.role);
  }

  @Post(':id/claim')
  claim(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.claimLead(id, user.id);
  }

  @Post(':id/release')
  release(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.releaseLead(id, user.id, user.role);
  }

  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.assignLead(id, dto.ownerId, user.role);
  }

  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.convertToCustomer(id, user.id, user.role);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.remove(id, user.id, user.role);
  }
}
