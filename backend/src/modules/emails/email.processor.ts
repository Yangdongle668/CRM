import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  QUEUE_EMAIL,
  EMAIL_JOB_SEND,
  EMAIL_JOB_FETCH,
} from '../../queue/queue.constants';
import { EmailsService } from './emails.service';
import { ImapSyncService } from './imap-sync.service';

interface FetchEmailJobData {
  configId: string;
}

interface SendEmailJobData {
  emailId: string;
  userId: string;
  requestOrigin?: string;
  /** 旧版本入队的任务才有 */
  inReplyToMessageId?: string;
  /** 本次提交的 scheduledAt，认领时校验，防止撤回后旧任务把邮件发出去 */
  scheduledAt?: string;
}

/**
 * BullMQ worker for the "email" queue.
 *
 * - "send"：SMTP 发信。邮件先以 DRAFT 落库再入队，任务里只带 id。
 * - "fetch-imap"：单个邮箱账户的 IMAP 增量同步，由
 *   ImapSyncService.scheduleSync 每分钟按账户投递。
 *
 * 并发 4：一个账户同步慢不会卡住其它账户和发信。
 */
@Processor(QUEUE_EMAIL, { concurrency: 4 })
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly emailsService: EmailsService,
    private readonly imapSync: ImapSyncService,
  ) {
    super();
  }

  async process(job: Job<SendEmailJobData | FetchEmailJobData>): Promise<any> {
    switch (job.name) {
      case EMAIL_JOB_SEND:
        return this.handleSend(job as Job<SendEmailJobData>);
      case EMAIL_JOB_FETCH:
        return this.imapSync.syncAccount((job.data as FetchEmailJobData).configId);
      default:
        throw new Error(`Unknown email job: ${job.name}`);
    }
  }

  private async handleSend(job: Job<SendEmailJobData>) {
    const { emailId, userId, requestOrigin, inReplyToMessageId, scheduledAt } = job.data;
    this.logger.log(`Delivering email ${emailId} (job ${job.id})`);
    return this.emailsService.deliverPendingEmail(emailId, {
      requestOrigin,
      inReplyToMessageId,
      actingUserId: userId,
      scheduledAt,
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    // 收信任务每分钟每账户一次，成功日志太吵；结果在 ImapSyncService 里记
    if (job.name === EMAIL_JOB_FETCH) return;
    this.logger.log(`Email job ${job.id} (${job.name}) completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, err: Error) {
    this.logger.error(
      `Email job ${job?.id} (${job?.name}) failed: ${err?.message}`,
    );
    // 发信任务重试用尽后才通知用户，中间的自动重试不打扰
    if (job?.name === EMAIL_JOB_SEND && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await this.emailsService
        .notifySendFailed((job.data as SendEmailJobData).emailId)
        .catch(() => undefined);
    }
  }
}
