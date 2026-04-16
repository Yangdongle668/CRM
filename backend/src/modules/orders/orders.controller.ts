import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto, UpdateOrderStatusDto, UpdatePaymentStatusDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@ApiTags('订单')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly auditService: AuditService,
  ) {}

  @Post()
  @RequirePermissions('order:create')
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  @RequirePermissions('order:read')
  async findAll(
    @CurrentUser() user: any,
    @Query() query: QueryOrderDto,
  ) {
    return this.ordersService.findAll(user.id, user.role, query);
  }

  @Get(':id')
  @RequirePermissions('order:read')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  @RequirePermissions('order:update')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @Req() req: Request,
  ) {
    // Snapshot the before-state so we can diff price-sensitive changes.
    let before: any = null;
    try {
      before = await this.ordersService.findOne(id, user.id, user.role);
    } catch {}

    const result = await this.ordersService.update(id, user.id, user.role, dto);

    // Surface price / total changes as a dedicated audit row so they're
    // easy to spot in the log viewer.
    const priceFields = ['totalAmount', 'floorPrice', 'paidAmount'];
    const changes: Record<string, { before: any; after: any }> = {};
    for (const f of priceFields) {
      if ((dto as any)[f] !== undefined && before && before[f] !== (dto as any)[f]) {
        changes[f] = { before: before[f], after: (dto as any)[f] };
      }
    }

    await this.auditService.logFromRequest(req, {
      action: Object.keys(changes).length > 0 ? 'order.price.update' : 'order.update',
      targetType: 'order',
      targetId: id,
      targetLabel: (before as any)?.orderNo ?? null,
      metadata: {
        changedFields: Object.keys(dto || {}),
        priceChanges: Object.keys(changes).length > 0 ? changes : undefined,
      },
    });

    return result;
  }

  @Delete(':id')
  @RequirePermissions('order:delete')
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    let label: string | null = null;
    try {
      const existing = await this.ordersService.findOne(id, user.id, user.role);
      label = (existing as any)?.orderNo ?? null;
    } catch {}

    try {
      const result = await this.ordersService.remove(id, user.id, user.role);
      await this.auditService.logFromRequest(req, {
        action: 'order.delete',
        targetType: 'order',
        targetId: id,
        targetLabel: label,
      });
      return result;
    } catch (err: any) {
      await this.auditService.logFromRequest(req, {
        action: 'order.delete',
        targetType: 'order',
        targetId: id,
        targetLabel: label,
        status: 'FAILURE',
        errorMessage: err?.message || String(err),
      });
      throw err;
    }
  }

  @Patch(':id/status')
  @RequirePermissions('order:status')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Req() req: Request,
  ) {
    const result = await this.ordersService.updateStatus(
      id,
      user.id,
      user.role,
      dto.status,
    );
    await this.auditService.logFromRequest(req, {
      action: 'order.status.update',
      targetType: 'order',
      targetId: id,
      targetLabel: (result as any)?.orderNo ?? null,
      metadata: { newStatus: dto.status },
    });
    return result;
  }

  @Patch(':id/payment')
  @RequirePermissions('order:payment')
  async updatePaymentStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
    @Req() req: Request,
  ) {
    const result = await this.ordersService.updatePaymentStatus(
      id,
      user.id,
      user.role,
      dto.paymentStatus,
    );
    await this.auditService.logFromRequest(req, {
      action: 'order.payment.update',
      targetType: 'order',
      targetId: id,
      targetLabel: (result as any)?.orderNo ?? null,
      metadata: { newPaymentStatus: dto.paymentStatus },
    });
    return result;
  }
}
