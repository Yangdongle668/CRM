import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { parsePiPdf, ParsedPi } from './pi-pdf-parser';

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
    if (dto.shippingAddr !== undefined) updateData.shippingAddr = dto.shippingAddr || null;
    if (dto.shippingDate !== undefined) updateData.shippingDate = new Date(dto.shippingDate);
    if (dto.deliveryDate !== undefined) updateData.deliveryDate = new Date(dto.deliveryDate);
    if (dto.trackingNo !== undefined) updateData.trackingNo = dto.trackingNo || null;
    if (dto.remark !== undefined) updateData.remark = dto.remark || null;

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

  /**
   * 解析上传的 PI PDF，并尝试匹配本系统已有的客户。
   * 仅返回预览数据 + 候选客户，不直接落库——前端确认无误后再走 create()。
   */
  async parsePiPreview(buffer: Buffer): Promise<{
    parsed: ParsedPi;
    customerSuggestions: Array<{ id: string; companyName: string; score: number }>;
  }> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('请上传有效的 PI PDF 文件');
    }
    let parsed: ParsedPi;
    try {
      parsed = await parsePiPdf(buffer);
    } catch (err: any) {
      throw new BadRequestException(`PDF 解析失败：${err?.message || err}`);
    }

    const customerSuggestions = await this.suggestCustomersFor(parsed.consigneeName);
    return { parsed, customerSuggestions };
  }

  /**
   * 由 consignee 名字模糊匹配 Customer.companyName。把名字 / contains 命中
   * 的客户按相似度返回最多 5 条；前端在导入向导里让用户选一条或新建客户。
   */
  private async suggestCustomersFor(
    consigneeName: string | null,
  ): Promise<Array<{ id: string; companyName: string; score: number }>> {
    if (!consigneeName) return [];
    const cleaned = consigneeName.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];

    // 抽两类查询：完整名 contains，以及首词 contains。
    const firstWord = cleaned.split(/[\s,;]+/)[0] || cleaned;
    const candidates = await this.prisma.customer.findMany({
      where: {
        OR: [
          { companyName: { contains: cleaned, mode: 'insensitive' } },
          { companyName: { contains: firstWord, mode: 'insensitive' } },
        ],
      },
      select: { id: true, companyName: true },
      take: 20,
    });

    const lowerTarget = cleaned.toLowerCase();
    const scored = candidates.map((c) => {
      const lower = c.companyName.toLowerCase();
      let score = 0;
      if (lower === lowerTarget) score = 100;
      else if (lower.includes(lowerTarget)) score = 80;
      else if (lowerTarget.includes(lower)) score = 70;
      else if (lower.startsWith(firstWord.toLowerCase())) score = 50;
      else score = 30;
      return { id: c.id, companyName: c.companyName, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 5);
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
