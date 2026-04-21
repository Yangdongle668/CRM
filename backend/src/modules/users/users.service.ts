import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    phone: true,
    avatar: true,
    bio: true,
    isActive: true,
    isSuperAdmin: true,
    preferences: true,
    birthday: true,
    createdAt: true,
    updatedAt: true,
  };

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: { role?: string; isActive?: boolean; search?: string }) {
    const where: any = {};

    if (query?.role) {
      where.role = query.role;
    }

    if (query?.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query?.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.user.findMany({
      where,
      select: this.userSelect,
      orderBy: [{ isSuperAdmin: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.userSelect,
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const existing = await this.findOne(id);

    // Super admin is immutable in a few key ways — role, activation and
    // the super-admin flag itself are all locked. Profile fields (name,
    // phone, avatar, email, password) can still be updated freely.
    if (existing.isSuperAdmin) {
      if ((dto as any).role && (dto as any).role !== existing.role) {
        throw new ForbiddenException('超级管理员的角色不可修改');
      }
      if ((dto as any).isActive === false) {
        throw new ForbiddenException('超级管理员不可停用');
      }
    }

    if (dto.email) {
      const dup = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id } },
      });
      if (dup) throw new ConflictException('Email already in use');
    }

    const data: any = { ...dto };
    // The super-admin flag is never set via the public update endpoint.
    delete data.isSuperAdmin;
    // preferences 走下面的 jsonb || 原子合并，不能混在 Prisma 的整块写入里，
    // 否则并发保存（如世界时钟 worldClockTimezones 与仪表盘 dashboardLayout）
    // 会发生 read-modify-write 竞态，后写的请求把先写的覆盖掉。
    delete data.preferences;
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }
    // birthday: 前端传 ISO 日期字符串（"YYYY-MM-DD"）或 null / 空串清除。
    if (dto.birthday !== undefined) {
      if (dto.birthday === null || dto.birthday === '') {
        data.birthday = null;
      } else if (typeof dto.birthday === 'string') {
        const parsed = new Date(dto.birthday);
        data.birthday = isNaN(parsed.getTime()) ? null : parsed;
      }
    }

    const mergePreferences =
      dto.preferences &&
      typeof dto.preferences === 'object' &&
      !Array.isArray(dto.preferences);
    const hasOtherFields = Object.keys(data).length > 0;

    return this.prisma.$transaction(async (tx) => {
      if (hasOtherFields) {
        await tx.user.update({ where: { id }, data });
      }
      if (mergePreferences) {
        // 用 Postgres 的 jsonb || 原子浅合并：只覆盖这次请求里提到的顶层键，
        // 其余键保持原值。单条 UPDATE 直接读当前值合并写入，没有中间 SELECT，
        // 所以并发请求之间不会互相丢更新。
        const prefsJson = JSON.stringify(dto.preferences);
        await tx.$executeRaw`
          UPDATE "users"
          SET "preferences" = COALESCE("preferences", '{}'::jsonb) || ${prefsJson}::jsonb
          WHERE "id" = ${id}
        `;
      }
      const fresh = await tx.user.findUnique({
        where: { id },
        select: this.userSelect,
      });
      if (!fresh) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return fresh;
    });
  }

  /**
   * Delete a user, transferring all records they own (customers, leads,
   * orders, PIs, ...) to the super admin so foreign-key constraints don't
   * block the deletion and no business data is orphaned.
   *
   * Rules:
   *   - Super admin is never deletable.
   *   - A user cannot delete themselves.
   *   - If for some reason no super admin exists (shouldn't happen post
   *     migration), the requester becomes the transfer target so the
   *     endpoint still succeeds.
   */
  async remove(id: string, requesterId?: string) {
    const target = await this.findOne(id);

    if (target.isSuperAdmin) {
      throw new ForbiddenException('超级管理员不可删除');
    }
    if (requesterId && id === requesterId) {
      throw new BadRequestException('不能删除当前登录的账号');
    }

    const superAdmin = await this.prisma.user.findFirst({
      where: { isSuperAdmin: true },
      select: { id: true },
    });
    const transferToId = superAdmin?.id || requesterId;
    if (!transferToId) {
      throw new BadRequestException(
        '找不到可接收该用户数据的超级管理员，请先设置超级管理员',
      );
    }
    if (transferToId === id) {
      // Defensive: never transfer a user's data to themselves.
      throw new BadRequestException('转移目标与被删除用户相同，操作已阻止');
    }

    await this.prisma.$transaction([
      // Owned business records — RESTRICT FK, must transfer
      this.prisma.customer.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.lead.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.lead.updateMany({
        where: { creatorId: id },
        data: { creatorId: transferToId },
      }),
      this.prisma.leadActivity.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.quotation.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.order.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.proformaInvoice.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.proformaInvoice.updateMany({
        where: { approverId: id },
        data: { approverId: transferToId },
      }),
      this.prisma.task.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.activity.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.document.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.memo.updateMany({
        where: { ownerId: id },
        data: { ownerId: transferToId },
      }),
      this.prisma.email.updateMany({
        where: { senderId: id },
        data: { senderId: transferToId },
      }),
      this.prisma.emailCampaign.updateMany({
        where: { createdById: id },
        data: { createdById: transferToId },
      }),
      // email_configs and messages have onDelete: Cascade — deleted automatically.
      this.prisma.user.delete({ where: { id } }),
    ]);

    return { message: 'User deleted successfully', transferredTo: transferToId };
  }

  /**
   * Promote a target user to super admin, demoting the previous super
   * admin. Only callable from the route handler when the *current* user
   * is the existing super admin.
   */
  async transferSuperAdmin(currentSuperAdminId: string, targetUserId: string) {
    if (currentSuperAdminId === targetUserId) {
      throw new BadRequestException('目标已经是超级管理员');
    }

    const target = await this.findOne(targetUserId);
    if (target.role !== 'ADMIN') {
      throw new BadRequestException('目标用户必须先是管理员角色');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: currentSuperAdminId },
        data: { isSuperAdmin: false },
      }),
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { isSuperAdmin: true },
      }),
    ]);

    return { message: 'Super admin transferred' };
  }
}
