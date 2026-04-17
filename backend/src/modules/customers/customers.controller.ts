import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll(
    @Query() query: QueryCustomerDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.customersService.findAll(query, user.id, user.role);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.customersService.findOne(id, user.id, user.role);
  }

  @Post()
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.customersService.create(dto, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.customersService.update(id, dto, user.id, user.role);
  }

  @Post(':id/sync-emails')
  syncEmails(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.customersService.syncEmailsByDomain(id, user.id, user.role);
  }

  @Post(':id/refresh-timeline')
  refreshTimeline(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.customersService.refreshTimeline(id, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('customer:delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
    @Req() req: Request,
  ) {
    // Snapshot the customer name *before* deletion so the audit row
    // still has a human-readable target.
    let label: string | null = null;
    try {
      const existing = await this.customersService.findOne(id, user.id, user.role);
      label = (existing as any)?.companyName ?? null;
    } catch {}

    try {
      const result = await this.customersService.remove(id, user.role);
      await this.auditService.logFromRequest(req, {
        action: 'customer.delete',
        targetType: 'customer',
        targetId: id,
        targetLabel: label,
        status: 'SUCCESS',
      });
      return result;
    } catch (err: any) {
      await this.auditService.logFromRequest(req, {
        action: 'customer.delete',
        targetType: 'customer',
        targetId: id,
        targetLabel: label,
        status: 'FAILURE',
        errorMessage: err?.message || String(err),
      });
      throw err;
    }
  }
}
