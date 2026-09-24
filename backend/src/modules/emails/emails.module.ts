import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { EmailTrackingService } from './email-tracking.service';
import { EmailProcessor } from './email.processor';
import { ImapSyncService } from './imap-sync.service';
import { EmailCustomerMatcher } from './email-customer-matcher.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { QUEUE_EMAIL } from '../../queue/queue.constants';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';
import { MessagesModule } from '../messages/messages.module';
import { EmailEventsService } from './email-events.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: QUEUE_EMAIL }),
    // Email 成功发送 / 收到回邮时通知跟进模块
    FollowUpsModule,
    // 复用站内消息的 WebSocket 网关推送邮件事件
    MessagesModule,
  ],
  controllers: [EmailsController],
  providers: [
    EmailsService,
    EmailTrackingService,
    EmailProcessor,
    ImapSyncService,
    EmailCustomerMatcher,
    EmailEventsService,
  ],
  exports: [EmailsService, EmailTrackingService],
})
export class EmailsModule {}
