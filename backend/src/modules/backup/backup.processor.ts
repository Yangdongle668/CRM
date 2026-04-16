import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  QUEUE_BACKUP,
  BACKUP_JOB_EXPORT,
} from '../../queue/queue.constants';
import { BackupService } from './backup.service';

/**
 * BullMQ worker for the "backup" queue.
 *
 * Handles long-running DB export + JSON serialization off the request
 * thread, writing the result under uploads/backups/.
 */
@Processor(QUEUE_BACKUP)
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(private readonly backupService: BackupService) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case BACKUP_JOB_EXPORT:
        return this.handleExport(job);
      default:
        throw new Error(`Unknown backup job: ${job.name}`);
    }
  }

  private async handleExport(job: Job) {
    this.logger.log(`Running backup export (job ${job.id})`);
    return this.backupService.exportToDisk();
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.log(
      `Backup job ${job.id} completed: ${result?.filePath || 'ok'}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Backup job ${job?.id} failed: ${err?.message}`,
    );
  }
}
