import { Module } from '@nestjs/common';
import { TranslateService } from './translate.service';
import { TranslateController } from './translate.controller';
import { EmailsModule } from '../emails/emails.module';

@Module({
  // 译文缓存按邮件存，需要复用邮件模块的读权限校验
  imports: [EmailsModule],
  controllers: [TranslateController],
  providers: [TranslateService],
  exports: [TranslateService],
})
export class TranslateModule {}
