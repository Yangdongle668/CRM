import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { EmailConfigDto } from './dto/email-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles('ADMIN')
  getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Put()
  @Roles('ADMIN')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Get('email-config')
  getEmailConfig(@CurrentUser() user: any) {
    return this.settingsService.getEmailConfig(user.id);
  }

  @Put('email-config')
  updateEmailConfig(@CurrentUser() user: any, @Body() dto: EmailConfigDto) {
    return this.settingsService.updateEmailConfig(user.id, dto);
  }

  @Post('email-config/test')
  testEmailConnection(@CurrentUser() user: any) {
    return this.settingsService.testEmailConnection(user.id);
  }
}
