import {
  Controller,
  Get,
  Post,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { BackupService } from './backup.service';

@Controller('backup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Download a ZIP of CSVs for the core business tables (customers,
   * contacts, leads, quotations, orders, tasks, activities, + the users
   * those rows belong to). Streams straight to the response — safe for
   * large datasets. Emails and other ephemera are intentionally excluded
   * (see BackupService for the exact list).
   */
  @Get('export')
  @RequirePermissions('backup:export')
  async exportBackup(@Res() res: Response, @Req() req: Request) {
    const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    await this.auditService.logFromRequest(req, {
      action: 'backup.export',
      targetType: 'backup',
      targetLabel: filename,
      metadata: { mode: 'sync', format: 'csv-zip' },
    });
    await this.backupService.streamBackupZip(res, filename);
  }

  /**
   * Queue a background export (writes the ZIP under uploads/backups/)
   * for large databases. Returns immediately with a jobId.
   */
  @Post('export/async')
  @RequirePermissions('backup:export')
  async exportBackupAsync(@Req() req: Request) {
    const result = await this.backupService.queueExport();
    await this.auditService.logFromRequest(req, {
      action: 'backup.export',
      targetType: 'backup',
      targetLabel: result?.jobId ? `job:${result.jobId}` : 'async',
      metadata: { mode: 'async', format: 'csv-zip', jobId: result?.jobId },
    });
    return result;
  }
}
