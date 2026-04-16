import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { PdfProcessor } from './pdf.processor';
import { EmailsModule } from '../emails/emails.module';
import { QUEUE_PDF } from '../../queue/queue.constants';

@Module({
  imports: [
    EmailsModule,
    BullModule.registerQueue({ name: QUEUE_PDF }),
  ],
  controllers: [QuotationsController],
  providers: [QuotationsService, PdfProcessor],
  exports: [QuotationsService],
})
export class QuotationsModule {}
