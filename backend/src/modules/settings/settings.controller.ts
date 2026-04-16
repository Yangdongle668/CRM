import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { BankInfoDto } from './dto/bank-info.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const uploadStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    const fs = require('fs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions('settings:read')
  getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Put()
  @RequirePermissions('settings:update')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  @Post('logo')
  @RequirePermissions('settings:update')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: uploadStorage,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  async uploadLogo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    const logoUrl = `/uploads/${file.filename}`;
    await this.settingsService.saveLogoUrl(logoUrl);
    return { logoUrl };
  }

  @Get('logo')
  @Public()
  async getLogo() {
    const logoUrl = await this.settingsService.getLogoUrl();
    return { logoUrl };
  }

  @Get('bank-info')
  @RequirePermissions('settings:read')
  getBankInfo() {
    return this.settingsService.getBankInfo();
  }

  @Put('bank-info')
  @RequirePermissions('settings:update')
  updateBankInfo(@Body() dto: BankInfoDto) {
    return this.settingsService.updateBankInfo(dto);
  }

  @Get('company-info')
  getCompanyInfo() {
    return this.settingsService.getCompanyInfo();
  }

  @Put('company-info')
  @RequirePermissions('settings:update')
  updateCompanyInfo(@Body() data: Record<string, string>) {
    return this.settingsService.updateCompanyInfo(data);
  }
}
