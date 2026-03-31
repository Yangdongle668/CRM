import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('export')
  async exportBackup(@Res() res: Response) {
    const backup = await this.backupService.exportAll();
    const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  }

  @Post('import')
  async importBackup(@Body() body: any) {
    return this.backupService.importAll(body);
  }
}
