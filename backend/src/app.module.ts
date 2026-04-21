import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { LeadsModule } from './modules/leads/leads.module';
import { EmailsModule } from './modules/emails/emails.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { SettingsModule } from './modules/settings/settings.module';
import { BackupModule } from './modules/backup/backup.module';
import { MemosModule } from './modules/memos/memos.module';
import { PIsModule } from './modules/pis/pis.module';
import { MessagesModule } from './modules/messages/messages.module';
import { RatesModule } from './modules/rates/rates.module';
import { WeatherModule } from './modules/weather/weather.module';
import { FollowUpsModule } from './modules/follow-ups/follow-ups.module';
import { TranslateModule } from './modules/translate/translate.module';
import { SearchModule } from './modules/search/search.module';
import { QueueModule } from './queue/queue.module';
import { PermissionsModule } from './common/permissions/permissions.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    QueueModule,
    PrismaModule,
    PermissionsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ContactsModule,
    LeadsModule,
    EmailsModule,
    QuotationsModule,
    OrdersModule,
    TasksModule,
    ActivitiesModule,
    DocumentsModule,
    DashboardModule,
    SettingsModule,
    BackupModule,
    MemosModule,
    PIsModule,
    MessagesModule,
    RatesModule,
    WeatherModule,
    FollowUpsModule,
    TranslateModule,
    SearchModule,
  ],
})
export class AppModule {}
