import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrderDto) {
    const orderNo = await this.generateOrderNo();

    const items = dto.items.map((item, index) => ({
      productName: item.productName,
      description: item.description,
      unit: item.unit || 'PCS',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.quantity * item.unitPrice,
      sortOrder: index,
    }));

    const totalAmount = items.reduce((sum, item) => sum + item.totalPrice, 0);

    const order = await this.prisma.order.create({
      data: {
        orderNo,
        customerId: dto.customerId,
        ownerId: userId,
        title: dto.title,
        currency: dto.currency || 'USD',
        totalAmount,
        costTypes: dto.costTypes ?? [],
        floorPrice: dto.floorPrice ?? undefined,
        shippingAddr: dto.shippingAddr,
        shippingDate: dto.shippingDate ? new Date(dto.shippingDate) : undefined,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        trackingNo: dto.trackingNo,
        remark: dto.remark,
        items: {
          create: items,
        },
      },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return order;
  }

  async findAll(userId: string, role: string, query: QueryOrderDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (role !== 'ADMIN' && role !== 'FINANCE') {
      where.ownerId = userId;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    const keyword = query.keyword || query.search;
    if (keyword) {
      where.OR = [
        { orderNo: { contains: keyword, mode: 'insensitive' } },
        { title: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, companyName: true } },
          owner: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (role !== 'ADMIN' && role !== 'FINANCE' && order.ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return order;
  }

  async update(id: string, userId: string, role: string, dto: UpdateOrderDto) {
    await this.findOne(id, userId, role);

    const updateData: any = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.currency !== undefined) updateData.currency = dto.currency;
    if (dto.costTypes !== undefined) updateData.costTypes = dto.costTypes;
    if (dto.floorPrice !== undefined) updateData.floorPrice = dto.floorPrice;
    if (dto.shippingAddr !== undefined) updateData.shippingAddr = dto.shippingAddr;
    if (dto.shippingDate !== undefined)
      updateData.shippingDate = new Date(dto.shippingDate);
    if (dto.deliveryDate !== undefined)
      updateData.deliveryDate = new Date(dto.deliveryDate);
    if (dto.trackingNo !== undefined) updateData.trackingNo = dto.trackingNo;
    if (dto.remark !== undefined) updateData.remark = dto.remark;

    if (dto.items !== undefined) {
      await this.prisma.orderItem.deleteMany({
        where: { orderId: id },
      });

      const items = dto.items.map((item, index) => ({
        orderId: id,
        productName: item.productName,
        description: item.description,
        unit: item.unit || 'PCS',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.quantity * item.unitPrice,
        sortOrder: index,
      }));

      await this.prisma.orderItem.createMany({ data: items });

      updateData.totalAmount = items.reduce(
        (sum, item) => sum + item.totalPrice,
        0,
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async remove(id: string, userId: string, role: string) {
    await this.findOne(id, userId, role);
    return this.prisma.order.delete({ where: { id } });
  }

  async updateStatus(
    id: string,
    userId: string,
    role: string,
    status: string,
  ) {
    await this.findOne(id, userId, role);

    return this.prisma.order.update({
      where: { id },
      data: { status: status as any },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async updatePaymentStatus(
    id: string,
    userId: string,
    role: string,
    paymentStatus: string,
  ) {
    await this.findOne(id, userId, role);

    return this.prisma.order.update({
      where: { id },
      data: { paymentStatus: paymentStatus as any },
      include: {
        customer: true,
        owner: { select: { id: true, name: true, email: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  private async generateOrderNo(): Promise<string> {
    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    const prefix = `ORD-${dateStr}-`;

    const lastOrder = await this.prisma.order.findFirst({
      where: { orderNo: { startsWith: prefix } },
      orderBy: { orderNo: 'desc' },
    });

    let seq = 1;
    if (lastOrder) {
      const lastSeq = parseInt(lastOrder.orderNo.replace(prefix, ''), 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(3, '0')}`;
  }
}
