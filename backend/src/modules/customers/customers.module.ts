import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomersExportService } from './customers.export.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomersExportService, PrismaService],
  exports: [CustomersService],
})
export class CustomersModule {}
