import {
  Controller,
  Get,
  Post,
  Body,
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

  @Get('export')
  @RequirePermissions('backup:export')
  async exportBackup(@Res() res: Response, @Req() req: Request) {
    const backup = await this.backupService.exportAll();
    const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;

    await this.auditService.logFromRequest(req, {
      action: 'backup.export',
      targetType: 'backup',
      targetLabel: filename,
      metadata: {
        mode: 'sync',
        tables: Object.keys((backup as any).data || {}),
      },
    });

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
  async exportBackupAsync(@Req() req: Request) {
    const result = await this.backupService.queueExport();
    await this.auditService.logFromRequest(req, {
      action: 'backup.export',
      targetType: 'backup',
      targetLabel: result?.jobId ? `job:${result.jobId}` : 'async',
      metadata: { mode: 'async', jobId: result?.jobId },
    });
    return result;
  }

  @Post('import')
  @RequirePermissions('backup:import')
  async importBackup(@Body() body: any, @Req() req: Request) {
    try {
      const result = await this.backupService.importAll(body);
      await this.auditService.logFromRequest(req, {
        action: 'backup.import',
        targetType: 'backup',
        metadata: {
          version: body?.version,
          exportedAt: body?.exportedAt,
          tables: body?.data ? Object.keys(body.data) : undefined,
        },
      });
      return result;
    } catch (err: any) {
      await this.auditService.logFromRequest(req, {
        action: 'backup.import',
        targetType: 'backup',
        status: 'FAILURE',
        errorMessage: err?.message || String(err),
      });
      throw err;
    }
  }
}
