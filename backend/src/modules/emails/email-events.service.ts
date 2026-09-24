import { Injectable, Logger, Optional } from '@nestjs/common';
import { MessagesGateway } from '../messages/messages.gateway';

/**
 * 邮件实时事件：复用站内消息的 Socket.IO 网关（/ws/messages，每个用户
 * 一个房间），把"新邮件到达 / 邮件已发出 / 发送失败"推给前端，替代
 * 邮件页每 60 秒轮询未读数。
 *
 * 推送是尽力而为：网关不可用或用户不在线都静默跳过，前端仍保留低频
 * 轮询兜底。
 */
@Injectable()
export class EmailEventsService {
  private readonly logger = new Logger(EmailEventsService.name);

  constructor(@Optional() private readonly gateway?: MessagesGateway) {}

  private emit(userId: string | null | undefined, event: string, payload: any) {
    if (!userId) return;
    try {
      this.gateway?.server?.to(MessagesGateway.userRoom(userId)).emit(event, payload);
    } catch (err: any) {
      this.logger.debug(`emit ${event} failed: ${err?.message}`);
    }
  }

  /** 某个邮箱账户同步到了新邮件 */
  newMail(userId: string, payload: { configId: string; inbound: number; outbound: number }) {
    this.emit(userId, 'email:new', payload);
  }

  emailSent(userId: string | null | undefined, payload: { id: string; subject: string }) {
    this.emit(userId, 'email:sent', payload);
  }

  emailFailed(
    userId: string | null | undefined,
    payload: { id: string; subject: string; error: string },
  ) {
    this.emit(userId, 'email:failed', payload);
  }
}
