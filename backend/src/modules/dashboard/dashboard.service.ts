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

  // ==================== 管理员专用统计 ====================

  private getDateRange(period: string): { from: Date; to: Date } {
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let from: Date;

    switch (period) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        break;
      case 'week': {
        const day = now.getDay() || 7; // Sunday=0 -> 7
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1, 0, 0, 0, 0);
        break;
      }
      case 'month':
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        break;
      case 'year':
        from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
    return { from, to };
  }

  async getAdminOverview(role: string, period = 'month') {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可查看');
    }

    const { from, to } = this.getDateRange(period);
    const dateFilter = { gte: from, lte: to };

    const [
      newCustomers,
      newLeads,
      newOrders,
      revenueResult,
      newActivities,
      completedTasks,
      sentEmails,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { createdAt: dateFilter } }),
      this.prisma.lead.count({ where: { createdAt: dateFilter } }),
      this.prisma.order.count({ where: { createdAt: dateFilter } }),
      this.prisma.order.aggregate({
        where: {
          createdAt: dateFilter,
          status: { notIn: ['CANCELLED'] },
        },
        _sum: { totalAmount: true },
      }),
      this.prisma.activity.count({ where: { createdAt: dateFilter } }),
      this.prisma.task.count({
        where: { updatedAt: dateFilter, status: 'COMPLETED' },
      }),
      this.prisma.email.count({
        where: { createdAt: dateFilter, direction: 'OUTBOUND' },
      }),
    ]);

    return {
      period,
      from,
      to,
      newCustomers,
      newLeads,
      newOrders,
      newRevenue: Number(revenueResult._sum.totalAmount || 0),
      newActivities,
      completedTasks,
      sentEmails,
    };
  }

  async getSalespersonStats(role: string, period = 'month') {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可查看');
    }

    const { from, to } = this.getDateRange(period);
    const dateFilter = { gte: from, lte: to };

    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: 'SALESPERSON' },
      select: { id: true, name: true, email: true },
    });

    const stats = await Promise.all(
      users.map(async (user) => {
        const [
          newCustomers,
          newLeads,
          newOrders,
          revenueResult,
          activities,
          sentEmails,
          totalCustomers,
          pendingTasks,
        ] = await Promise.all([
          this.prisma.customer.count({
            where: { ownerId: user.id, createdAt: dateFilter },
          }),
          this.prisma.lead.count({
            where: { ownerId: user.id, createdAt: dateFilter },
          }),
          this.prisma.order.count({
            where: { ownerId: user.id, createdAt: dateFilter },
          }),
          this.prisma.order.aggregate({
            where: {
              ownerId: user.id,
              createdAt: dateFilter,
              status: { notIn: ['CANCELLED'] },
            },
            _sum: { totalAmount: true },
          }),
          this.prisma.activity.count({
            where: { ownerId: user.id, createdAt: dateFilter },
          }),
          this.prisma.email.count({
            where: {
              senderId: user.id,
              createdAt: dateFilter,
              direction: 'OUTBOUND',
            },
          }),
          this.prisma.customer.count({ where: { ownerId: user.id } }),
          this.prisma.task.count({
            where: { ownerId: user.id, status: 'PENDING' },
          }),
        ]);

        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          newCustomers,
          newLeads,
          newOrders,
          revenue: Number(revenueResult._sum.totalAmount || 0),
          activities,
          sentEmails,
          totalCustomers,
          pendingTasks,
        };
      }),
    );

    return stats.sort((a, b) => b.revenue - a.revenue);
  }

  async getFollowUpProgress(role: string) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可查看');
    }

    const now = new Date();
    const weekStart = new Date(now);
    const day = now.getDay() || 7;
    weekStart.setDate(now.getDate() - day + 1);
    weekStart.setHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: 'SALESPERSON' },
      select: { id: true, name: true, email: true },
    });

    const data = await Promise.all(
      users.map(async (user) => {
        const [
          weeklyActivities,
          weeklyLeadActivities,
          activeLeads,
          dueFollowUps,
          overdueFollowUps,
          stagnantLeads,
          weeklyEmails,
        ] = await Promise.all([
          this.prisma.activity.count({
            where: { ownerId: user.id, createdAt: { gte: weekStart } },
          }),
          this.prisma.leadActivity.count({
            where: { ownerId: user.id, createdAt: { gte: weekStart } },
          }),
          this.prisma.lead.count({
            where: {
              ownerId: user.id,
              stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
            },
          }),
          this.prisma.lead.count({
            where: {
              ownerId: user.id,
              nextFollowUpAt: { gte: now, lte: inSevenDays },
            },
          }),
          this.prisma.lead.count({
            where: {
              ownerId: user.id,
              nextFollowUpAt: { lt: now },
              stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
            },
          }),
          this.prisma.lead.count({
            where: {
              ownerId: user.id,
              stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
              OR: [
                { lastContactAt: null, createdAt: { lt: fourteenDaysAgo } },
                { lastContactAt: { lt: fourteenDaysAgo } },
              ],
            },
          }),
          this.prisma.email.count({
            where: {
              senderId: user.id,
              direction: 'OUTBOUND',
              createdAt: { gte: weekStart },
            },
          }),
        ]);

        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          weeklyActivities: weeklyActivities + weeklyLeadActivities,
          activeLeads,
          dueFollowUps,
          overdueFollowUps,
          stagnantLeads,
          weeklyEmails,
        };
      }),
    );

    return data;
  }

  async getTrend(role: string, granularity: 'day' | 'month' = 'day', days = 30) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('仅管理员可查看');
    }

    const now = new Date();
    const points: Array<{ key: string; from: Date; to: Date }> = [];

    if (granularity === 'day') {
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const from = new Date(d);
        const to = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        points.push({ key, from, to });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const from = new Date(d);
        const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        points.push({ key, from, to });
      }
    }

    const result = await Promise.all(
      points.map(async (p) => {
        const [leads, customers, orders, revenueAgg] = await Promise.all([
          this.prisma.lead.count({ where: { createdAt: { gte: p.from, lte: p.to } } }),
          this.prisma.customer.count({ where: { createdAt: { gte: p.from, lte: p.to } } }),
          this.prisma.order.count({ where: { createdAt: { gte: p.from, lte: p.to } } }),
          this.prisma.order.aggregate({
            where: {
              createdAt: { gte: p.from, lte: p.to },
              status: { notIn: ['CANCELLED'] },
            },
            _sum: { totalAmount: true },
          }),
        ]);
        return {
          key: p.key,
          leads,
          customers,
          orders,
          revenue: Number(revenueAgg._sum.totalAmount || 0),
        };
      }),
    );

    return result;
  }
}
