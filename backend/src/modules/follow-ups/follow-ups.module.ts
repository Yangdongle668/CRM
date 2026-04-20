import { Module } from '@nestjs/common';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService } from './follow-ups.service';

@Module({
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
  // 导出给 EmailsModule / LeadsModule 的 hook 调用
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
