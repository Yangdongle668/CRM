import { Module } from '@nestjs/common';
import { PIsService } from './pis.service';
import { PIsController } from './pis.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [PIsController],
  providers: [PIsService],
  exports: [PIsService],
})
export class PIsModule {}
