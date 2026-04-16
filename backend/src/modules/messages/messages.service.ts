import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async send(fromId: string, toId: string, content: string) {
    return this.prisma.message.create({
      data: { fromId, toId, content },
      include: {
        from: { select: { id: true, name: true } },
        to:   { select: { id: true, name: true } },
      },
    });
  }

  /** All messages between two users, oldest first */
  async getHistory(userId: string, otherId: string) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [
          { fromId: userId, toId: otherId },
          { fromId: otherId, toId: userId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: { from: { select: { id: true, name: true } } },
      take: 200,
    });
    // Mark incoming messages as read
    await this.prisma.message.updateMany({
      where: { fromId: otherId, toId: userId, isRead: false },
      data: { isRead: true },
    });
    return messages;
  }

  /** Latest message per conversation partner */
  async getConversations(userId: string) {
    // Get distinct partners
    const sent     = await this.prisma.message.findMany({ where: { fromId: userId }, select: { toId: true }, distinct: ['toId'] });
    const received = await this.prisma.message.findMany({ where: { toId: userId },   select: { fromId: true }, distinct: ['fromId'] });

    const partnerIds = [...new Set([
      ...sent.map((m) => m.toId),
      ...received.map((m) => m.fromId),
    ])];

    const conversations = await Promise.all(
      partnerIds.map(async (partnerId) => {
        const [latest, unread, partner] = await Promise.all([
          this.prisma.message.findFirst({
            where: {
              OR: [
                { fromId: userId, toId: partnerId },
                { fromId: partnerId, toId: userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
            include: { from: { select: { id: true, name: true } } },
          }),
          this.prisma.message.count({
            where: { fromId: partnerId, toId: userId, isRead: false },
          }),
          this.prisma.user.findUnique({
            where: { id: partnerId },
            select: { id: true, name: true, role: true, phone: true, email: true, bio: true, avatar: true },
          }),
        ]);
        return { partner, latest, unread };
      }),
    );

    return conversations
      .filter((c) => c.partner && c.latest)
      .sort((a, b) =>
        new Date(b.latest!.createdAt).getTime() - new Date(a.latest!.createdAt).getTime(),
      );
  }

  async getUnreadCount(userId: string) {
    return this.prisma.message.count({ where: { toId: userId, isRead: false } });
  }

  /** All active users except self (for starting a new conversation) */
  async getUsers(currentUserId: string) {
    return this.prisma.user.findMany({
      where: { id: { not: currentUserId }, isActive: true },
      select: { id: true, name: true, role: true, phone: true, email: true, bio: true, avatar: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Single user profile (for profile card) */
  async getUserProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, phone: true, email: true, bio: true, avatar: true },
    });
  }
}
