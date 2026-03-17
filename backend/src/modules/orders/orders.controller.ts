import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto, UpdateOrderStatusDto, UpdatePaymentStatusDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@ApiTags('订单')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.id, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() query: QueryOrderDto,
  ) {
    return this.ordersService.findAll(user.id, user.role, query);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.ordersService.remove(id, user.id, user.role);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, user.id, user.role, dto.status);
  }

  @Patch(':id/payment')
  async updatePaymentStatus(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.ordersService.updatePaymentStatus(
      id,
      user.id,
      user.role,
      dto.paymentStatus,
    );
  }
}
