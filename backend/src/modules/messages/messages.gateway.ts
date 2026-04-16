import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

interface AuthedSocket extends Socket {
  userId?: string;
}

/**
 * Real-time messaging gateway.
 *
 * Replaces the legacy 3s / 10s polling on the /messages page.
 * Clients connect with a JWT (Authorization header, auth payload, or
 * `?token=` query) and are automatically joined to a per-user room so
 * incoming messages can be pushed instantly.
 */
@WebSocketGateway({
  namespace: '/ws/messages',
  cors: { origin: '*', credentials: true },
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(MessagesGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Room name for a given user — all sockets for that user subscribe here.
   */
  static userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private extractToken(client: AuthedSocket): string | null {
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader && typeof authHeader === 'string') {
      const [scheme, token] = authHeader.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) return token;
      return authHeader;
    }
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string') return queryToken;
    return null;
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`WS reject ${client.id}: missing token`);
        client.disconnect(true);
        return;
      }

      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        this.configService.get<string>('jwt.secret');

      const payload: any = this.jwtService.verify(token, { secret });
      const userId = payload?.sub;
      if (!userId) {
        client.disconnect(true);
        return;
      }

      // Validate user still exists and is active.
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isActive: true },
      });
      if (!user || !user.isActive) {
        client.disconnect(true);
        return;
      }

      client.userId = userId;
      await client.join(MessagesGateway.userRoom(userId));
      client.emit('connected', { userId });
      this.logger.log(`WS connected user=${userId} socket=${client.id}`);
    } catch (err: any) {
      this.logger.warn(
        `WS reject ${client.id}: ${err?.message || 'verify failed'}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    if (client.userId) {
      this.logger.log(
        `WS disconnected user=${client.userId} socket=${client.id}`,
      );
    }
  }

  /**
   * Optional typing indicator — forwarded to the counterpart's room.
   */
  @SubscribeMessage('typing')
  onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { toId: string; isTyping: boolean },
  ) {
    if (!client.userId || !body?.toId) return;
    this.server.to(MessagesGateway.userRoom(body.toId)).emit('typing', {
      fromId: client.userId,
      isTyping: !!body.isTyping,
    });
  }

  /**
   * Push a newly-persisted message to both participants.
   * Used by MessagesService after DB write.
   */
  emitNewMessage(message: {
    id: string;
    fromId: string;
    toId: string;
    content: string;
    createdAt: Date | string;
    from: { id: string; name: string };
    to?: { id: string; name: string };
  }) {
    const payload = {
      ...message,
      createdAt:
        message.createdAt instanceof Date
          ? message.createdAt.toISOString()
          : message.createdAt,
    };
    this.server
      .to(MessagesGateway.userRoom(message.toId))
      .emit('message:new', payload);
    this.server
      .to(MessagesGateway.userRoom(message.fromId))
      .emit('message:new', payload);
  }

  /**
   * Notify a user that their unread conversation list has changed.
   */
  emitConversationUpdate(userId: string) {
    this.server
      .to(MessagesGateway.userRoom(userId))
      .emit('conversation:update', { userId });
  }
}
