import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string, role: string) {
    const ownerFilter = role !== 'ADMIN' ? { ownerId: userId } : {};

    const [totalCustomers, totalLeads, totalOrders, revenueResult] =
      await Promise.all([
        this.prisma.customer.count({ where: ownerFilter }),
        this.prisma.lead.count({ where: ownerFilter }),
        this.prisma.order.count({ where: ownerFilter }),
        this.prisma.order.aggregate({
          where: {
            ...ownerFilter,
            status: { notIn: ['CANCELLED'] },
          },
          _sum: { totalAmount: true },
        }),
      ]);

    return {
      totalCustomers,
      totalLeads,
      totalOrders,
      totalRevenue: revenueResult._sum.totalAmount || 0,
    };
  }

  async getSalesTrend(userId: string, role: string) {
    const ownerFilter = role !== 'ADMIN' ? { ownerId: userId } : {};

    const now = new Date();
    const twelveMonthsAgo = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      1,
    );

    const orders = await this.prisma.order.findMany({
      where: {
        ...ownerFilter,
        status: { notIn: ['CANCELLED'] },
        createdAt: { gte: twelveMonthsAgo },
      },
      select: {
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by month
    const monthlyData: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = 0;
    }

    for (const order of orders) {
      const date = new Date(order.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (key in monthlyData) {
        monthlyData[key] += Number(order.totalAmount);
      }
    }

    return Object.entries(monthlyData).map(([month, amount]) => ({
      month,
      amount,
    }));
  }

  async getFunnel(userId: string, role: string) {
    const ownerFilter = role !== 'ADMIN' ? { ownerId: userId } : {};

    const stages = [
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'PROPOSAL',
      'NEGOTIATION',
      'CLOSED_WON',
      'CLOSED_LOST',
    ] as const;

    const counts = await Promise.all(
      stages.map(async (stage) => {
        const count = await this.prisma.lead.count({
          where: {
            ...ownerFilter,
            stage,
          },
        });
        return { stage, count };
      }),
    );

    return counts;
  }

  async getRankings(userId: string, role: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Only admin can view rankings');
    }

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        orders: {
          where: { status: { notIn: ['CANCELLED'] } },
          select: { totalAmount: true },
        },
        _count: {
          select: {
            customers: true,
            orders: true,
          },
        },
      },
    });

    const rankings = users
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        totalRevenue: user.orders.reduce(
          (sum, order) => sum + Number(order.totalAmount),
          0,
        ),
        customerCount: user._count.customers,
        orderCount: user._count.orders,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    return rankings;
  }
}
