import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupProcessor } from './backup.processor';
import { PrismaModule } from '../../prisma/prisma.module';
import { QUEUE_BACKUP } from '../../queue/queue.constants';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: QUEUE_BACKUP }),
  ],
  controllers: [BackupController],
  providers: [BackupService, BackupProcessor],
})
export class BackupModule {}
