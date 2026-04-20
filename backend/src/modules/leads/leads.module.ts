import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FollowUpsModule } from '../follow-ups/follow-ups.module';

@Module({
  // Lead 阶段变化时通知跟进模块重算 dueAt / 关闭跟进
  imports: [FollowUpsModule],
  controllers: [LeadsController],
  providers: [LeadsService, PrismaService],
  exports: [LeadsService],
})
export class LeadsModule {}
