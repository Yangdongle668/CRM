import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  QUEUE_PDF,
  PDF_JOB_SEND_QUOTATION,
} from '../../queue/queue.constants';
import { QuotationsService } from './quotations.service';

interface SendQuotationJobData {
  quotationId: string;
  userId: string;
  role: string;
}

/**
 * BullMQ worker for the "pdf" queue.
 *
 * Heavy PDF generation + SMTP delivery of quotations happens here so the
 * request thread doesn't block.
 */
@Processor(QUEUE_PDF)
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(private readonly quotationsService: QuotationsService) {
    super();
  }

  async process(job: Job<SendQuotationJobData>): Promise<any> {
    switch (job.name) {
      case PDF_JOB_SEND_QUOTATION:
        return this.handleSendQuotation(job);
      default:
        throw new Error(`Unknown pdf job: ${job.name}`);
    }
  }

  private async handleSendQuotation(job: Job<SendQuotationJobData>) {
    const { quotationId, userId, role } = job.data;
    this.logger.log(
      `Generating + sending quotation ${quotationId} (job ${job.id})`,
    );
    return this.quotationsService.deliverQuotation(quotationId, userId, role);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`PDF job ${job.id} (${job.name}) completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(
      `PDF job ${job?.id} (${job?.name}) failed: ${err?.message}`,
    );
  }
}
