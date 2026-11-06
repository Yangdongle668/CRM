import { EmailAiSettingsService } from './email-ai-settings.service';
import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { PITemplatesController } from './pi-templates.controller';
import { PITemplatesService } from './pi-templates.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [
    SettingsController,
    BankAccountsController,
    PITemplatesController,
  ],
  providers: [
    SettingsService,
    EmailAiSettingsService,
    BankAccountsService,
    PITemplatesService,
    PrismaService,
  ],
  exports: [SettingsService, EmailAiSettingsService, BankAccountsService, PITemplatesService],
})
export class SettingsModule {}
