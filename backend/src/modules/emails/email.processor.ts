import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_EMAIL, EMAIL_JOB_SEND } from '../../queue/queue.constants';
import { EmailsService } from './emails.service';

interface SendEmailJobData {
  emailId: string;
  userId: string;
  requestOrigin?: string;
  inReplyToMessageId?: string;
}

/**
 * BullMQ worker for the "email" queue.
 *
 * Currently handles the "send" job (SMTP delivery). The job payload is
 * small — we persist the email as a DRAFT row before enqueueing, so the
 * worker only needs the id to pick up.
 */
@Processor(QUEUE_EMAIL)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailsService: EmailsService) {
    super();
  }

  async process(job: Job<SendEmailJobData>): Promise<any> {
    switch (job.name) {
      case EMAIL_JOB_SEND:
        return this.handleSend(job);
      default:
        throw new Error(`Unknown email job: ${job.name}`);
    }
  }

  private async handleSend(job: Job<SendEmailJobData>) {
    const { emailId, userId, requestOrigin, inReplyToMessageId } = job.data;
    this.logger.log(`Delivering email ${emailId} (job ${job.id})`);
    return this.emailsService.deliverPendingEmail(emailId, {
      requestOrigin,
      inReplyToMessageId,
      actingUserId: userId,
    });
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Email job ${job.id} (${job.name}) completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `Email job ${job?.id} (${job?.name}) failed: ${err?.message}`,
    );
  }
}
