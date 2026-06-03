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
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { CustomersService } from './customers.service';
import {
  CustomersExportService,
  CUSTOMER_STATUS_LABELS,
} from './customers.export.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { CustomerStatus, Prisma } from '@prisma/client';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly exportService: CustomersExportService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  findAll(
    @Query() query: QueryCustomerDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.customersService.findAll(query, user.id, user.role);
  }

  /**
   * "好久没联系"名单 —— 给仪表盘温度小组件用。
   * 静态路由必须声明在 :id 前面，避免被当作 id 捕获。
   */
  @Get('dormant')
  findDormant(
    @Query('days') days: string,
    @Query('limit') limit: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const d = Number(days);
    const l = Number(limit);
    return this.customersService.findDormant(
      user.id,
      user.role,
      Number.isFinite(d) && d > 0 ? d : 30,
      Number.isFinite(l) && l > 0 ? l : 20,
    );
  }

  /**
   * 客户档案表 xlsx 导出 —— 严格按线下模板布局 (LD-SM-FM-001/A0)。
   * `status` 可选 ALL / POTENTIAL / ACTIVE / INACTIVE / BLACKLISTED；
   * SALESPERSON 始终只能导出自己名下的客户。
   * 静态路由必须声明在 :id 前面，避免被当成 id 捕获。
   */
  @Get('export/xlsx')
  async exportXlsx(
    @Query('status') status: string | undefined,
    @CurrentUser() user: { id: string; role: string },
    @Res() res: Response,
    @Req() req: Request,
  ) {
    const normalizedStatus = (status || 'ALL').toUpperCase();
    const validStatuses = ['ALL', 'POTENTIAL', 'ACTIVE', 'INACTIVE', 'BLACKLISTED'];
    if (!validStatuses.includes(normalizedStatus)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }

    const where: Prisma.CustomerWhereInput = {};
    if (user.role === 'SALESPERSON') where.ownerId = user.id;
    if (normalizedStatus !== 'ALL') {
      where.status = normalizedStatus as CustomerStatus;
    }

    const statusLabel =
      CUSTOMER_STATUS_LABELS[normalizedStatus as keyof typeof CUSTOMER_STATUS_LABELS] ||
      '客户';

    await this.auditService.logFromRequest(req, {
      action: 'customer.export',
      targetType: 'customer',
      targetLabel: statusLabel,
      metadata: { status: normalizedStatus, format: 'xlsx' },
    });

    await this.exportService.streamArchiveXlsx(res, where, statusLabel);
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
