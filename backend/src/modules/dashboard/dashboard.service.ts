import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string, role: string) {
    const ownerFilter = role !== 'ADMIN' ? { ownerId: userId } : {};

    const [
      totalCustomers,
      totalLeads,
      totalOrders,
      revenueResult,
      pendingTasks,
      newLeadsThisMonth,
    ] = await Promise.all([
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
      this.prisma.task.count({
        where: {
          ...ownerFilter,
          status: 'PENDING',
        },
      }),
      this.prisma.lead.count({
        where: {
          ...ownerFilter,
          createdAt: {
            gte: new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1,
            ),
          },
        },
      }),
    ]);

    return {
      totalCustomers,
      totalLeads,
      totalOrders,
      totalRevenue: revenueResult._sum.totalAmount || 0,
      pendingTasks,
      newLeadsThisMonth,
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
    const monthlyAmount: Record<string, number> = {};
    const monthlyCount: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyAmount[key] = 0;
      monthlyCount[key] = 0;
    }

    for (const order of orders) {
      const date = new Date(order.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (key in monthlyAmount) {
        monthlyAmount[key] += Number(order.totalAmount);
        monthlyCount[key] += 1;
      }
    }

    return Object.keys(monthlyAmount).map((month) => ({
      month,
      amount: monthlyAmount[month],
      count: monthlyCount[month],
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
        userId: user.id,
        name: user.name,
        revenue: user.orders.reduce(
          (sum, order) => sum + Number(order.totalAmount),
          0,
        ),
        orderCount: user._count.orders,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    return rankings;
  }
}
