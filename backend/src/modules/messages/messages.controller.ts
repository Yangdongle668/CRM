import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('users')
  getUsers(@CurrentUser() user: any) {
    return this.messagesService.getUsers(user.id);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: any) {
    return this.messagesService.getUnreadCount(user.id);
  }

  @Get('conversations')
  getConversations(@CurrentUser() user: any) {
    return this.messagesService.getConversations(user.id);
  }

  @Get(':userId/profile')
  getUserProfile(@Param('userId') userId: string) {
    return this.messagesService.getUserProfile(userId);
  }

  @Get(':userId')
  getHistory(@CurrentUser() user: any, @Param('userId') otherId: string) {
    return this.messagesService.getHistory(user.id, otherId);
  }

  @Post()
  send(@CurrentUser() user: any, @Body() body: { toId: string; content: string }) {
    return this.messagesService.send(user.id, body.toId, body.content);
  }
}
