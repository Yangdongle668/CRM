import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { EmailTrackingService } from './email-tracking.service';
import { EmailProcessor } from './email.processor';
import { PrismaModule } from '../../prisma/prisma.module';
import { QUEUE_EMAIL } from '../../queue/queue.constants';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: QUEUE_EMAIL }),
  ],
  controllers: [EmailsController],
  providers: [EmailsService, EmailTrackingService, EmailProcessor],
  exports: [EmailsService, EmailTrackingService],
})
export class EmailsModule {}
