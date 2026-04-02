import { Module } from '@nestjs/common';
import { MemosService } from './memos.service';
import { MemosController } from './memos.controller';

@Module({
  controllers: [MemosController],
  providers: [MemosService],
})
export class MemosModule {}
