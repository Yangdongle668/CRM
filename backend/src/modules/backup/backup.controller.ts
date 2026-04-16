import {
  Controller,
  Get,
  Post,
  Res,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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

  /**
   * Restore from a backup ZIP.
   *
   * 🚨 Destructive: replaces every business table (customers, contacts,
   * leads, quotations, orders, tasks, activities + their users) and
   * clears anything that FK-references them (emails, PIs, documents,
   * memos, messages). System tables (roles / permissions / audit logs
   * / settings) are preserved, and the user running the restore is
   * preserved so their session stays valid.
   */
  @Post('import')
  @RequirePermissions('backup:import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 200 * 1024 * 1024 /* 200 MB */ },
    }),
  )
  async importBackup(
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 200 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('请选择要导入的备份文件');
    }
    if (!/\.zip$/i.test(file.originalname)) {
      throw new BadRequestException('请上传备份 ZIP 文件 (.zip)');
    }

    const currentUserId = (req as any).user?.id as string | undefined;

    try {
      const result = await this.backupService.importFromZip(file.buffer, {
        currentUserId,
      });
      await this.auditService.logFromRequest(req, {
        action: 'backup.import',
        targetType: 'backup',
        targetLabel: file.originalname,
        metadata: {
          filename: file.originalname,
          sizeBytes: file.size,
          imported: result.imported,
          skipped: result.skipped,
        },
      });
      return result;
    } catch (err: any) {
      await this.auditService.logFromRequest(req, {
        action: 'backup.import',
        targetType: 'backup',
        targetLabel: file.originalname,
        status: 'FAILURE',
        errorMessage: err?.message || String(err),
      });
      throw err;
    }
  }
}
