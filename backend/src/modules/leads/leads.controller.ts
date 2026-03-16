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
import { LeadsService } from './leads.service';
import { CreateLeadDto, LeadStage } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadDto } from './dto/query-lead.dto';
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

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.findOne(id, user.id, user.role);
  }

  @Post()
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.create(dto, user.id);
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

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.leadsService.remove(id, user.id, user.role);
  }
}
