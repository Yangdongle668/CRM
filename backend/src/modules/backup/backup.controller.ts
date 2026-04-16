import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { BackupService } from './backup.service';

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('export')
  @RequirePermissions('backup:export')
  async exportBackup(@Res() res: Response) {
    const backup = await this.backupService.exportAll();
    const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backup, null, 2));
  }

  /**
   * Async export: returns immediately with a jobId. The background worker
   * writes the JSON file under uploads/backups/. Useful for large databases
   * where the request would otherwise time out.
   */
  @Post('export/async')
  @RequirePermissions('backup:export')
  async exportBackupAsync() {
    return this.backupService.queueExport();
  }

  @Post('import')
  @RequirePermissions('backup:import')
  async importBackup(@Body() body: any) {
    return this.backupService.importAll(body);
  }
}
