import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { PITemplatesService } from './pi-templates.service';
import {
  CreatePITemplateDto,
  UpdatePITemplateDto,
} from './dto/pi-template.dto';

@Controller('settings/pi-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PITemplatesController {
  constructor(private readonly templatesService: PITemplatesService) {}

  @Get()
  @RequirePermissions('pi:read')
  findAll() {
    return this.templatesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('pi:read')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @RequirePermissions('settings:update')
  create(@Body() dto: CreatePITemplateDto) {
    return this.templatesService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('settings:update')
  update(@Param('id') id: string, @Body() dto: UpdatePITemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('settings:update')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  @Patch(':id/default')
  @RequirePermissions('settings:update')
  setDefault(@Param('id') id: string) {
    return this.templatesService.setDefault(id);
  }
}
