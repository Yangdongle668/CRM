import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { PERMISSION_CATALOG } from './permissions.catalog';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';

/**
 * RBAC admin endpoints:
 *  GET  /auth/me/permissions          → current user's permissions
 *  GET  /rbac/catalog                 → all permission codes
 *  GET  /rbac/roles/:role/permissions → permission codes assigned to a role
 *  PUT  /rbac/roles/:role/permissions → replace a role's permission set
 */
@ApiTags('RBAC')
@ApiBearerAuth('JWT-auth')
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /** Any authenticated user can ask for their own effective permissions. */
  @Get('auth/me/permissions')
  async myPermissions(@CurrentUser() user: any) {
    // 走 user 级别：超级管理员拿 `*`，其他用户走自己 role 对应的 RolePermission。
    const codes = await this.permissionsService.listForUser(user);
    return {
      role: user.role,
      isSuperAdmin: !!user.isSuperAdmin,
      permissions: codes,
    };
  }

  @Get('rbac/catalog')
  @RequirePermissions('rbac:read')
  async catalog() {
    return { permissions: PERMISSION_CATALOG };
  }

  /** List every role (built-in + custom) with permission & user counts. */
  @Get('rbac/roles')
  @RequirePermissions('rbac:read')
  async listRoles() {
    const roles = await this.permissionsService.listRoles();
    return { roles };
  }

  /**
   * 仅返回 code + name 的精简角色列表，给"新建/编辑用户"的角色下拉用。
   * 不带权限统计、用户数等敏感数据，所以不需要 rbac:read，仅要求登录即可——
   * 否则普通管理员（被超级管理员剥离了 rbac:read 后）就没法看到自定义角色，
   * 用户表单也就不会动态更新。
   */
  @Get('rbac/role-options')
  async listRoleOptions() {
    const roles = await this.permissionsService.listRoles();
    return {
      roles: roles.map((r) => ({
        code: r.code,
        name: r.name,
        isBuiltin: r.isBuiltin,
      })),
    };
  }

  @Post('rbac/roles')
  @RequirePermissions('rbac:update')
  async createRole(
    @Body() body: { code: string; name: string; description?: string },
    @Req() req: Request,
  ) {
    const role = await this.permissionsService.createRole(body);
    await this.auditService.logFromRequest(req, {
      action: 'rbac.role.create',
      targetType: 'role',
      targetId: role.code,
      targetLabel: role.name,
      metadata: { description: role.description },
    });
    return { role };
  }

  @Patch('rbac/roles/:role')
  @RequirePermissions('rbac:update')
  async updateRole(
    @Param('role') code: string,
    @Body() body: { name?: string; description?: string | null },
    @Req() req: Request,
  ) {
    const role = await this.permissionsService.updateRole(code, body);
    await this.auditService.logFromRequest(req, {
      action: 'rbac.role.update.meta',
      targetType: 'role',
      targetId: role.code,
      targetLabel: role.name,
      metadata: { changed: body },
    });
    return { role };
  }

  @Delete('rbac/roles/:role')
  @RequirePermissions('rbac:update')
  async deleteRole(@Param('role') code: string, @Req() req: Request) {
    try {
      const result = await this.permissionsService.deleteRole(code);
      await this.auditService.logFromRequest(req, {
        action: 'rbac.role.delete',
        targetType: 'role',
        targetId: code,
        targetLabel: code,
      });
      return result;
    } catch (err: any) {
      await this.auditService.logFromRequest(req, {
        action: 'rbac.role.delete',
        targetType: 'role',
        targetId: code,
        targetLabel: code,
        status: 'FAILURE',
        errorMessage: err?.message || String(err),
      });
      throw err;
    }
  }

  @Get('rbac/roles/:role/permissions')
  @RequirePermissions('rbac:read')
  async getRolePermissions(@Param('role') role: string) {
    const codes = await this.permissionsService.listForRole(role);
    return { role, permissions: codes };
  }

  @Put('rbac/roles/:role/permissions')
  @RequirePermissions('rbac:update')
  async setRolePermissions(
    @Param('role') role: string,
    @Body() body: { permissions: string[] },
    @Req() req: Request,
  ) {
    // 之前对 ADMIN 走"无需配置"短路；现在 ADMIN 是普通可配置角色，
    // 超级管理员通过 isSuperAdmin 拿 `*`，不再依赖 role==='ADMIN'。
    // Enforce that the role actually exists so admins can't accidentally
    // create "ghost" permission sets.
    await this.permissionsService.getRole(role);
    const before = await this.permissionsService.listForRole(role);
    const codes = Array.isArray(body?.permissions) ? body.permissions : [];
    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ role, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ]);

    this.permissionsService.invalidateRole(role);
    const after = permissions.map((p) => p.code).sort();
    await this.auditService.logFromRequest(req, {
      action: 'rbac.role.update',
      targetType: 'role',
      targetId: role,
      targetLabel: role,
      metadata: {
        before,
        after,
        added: after.filter((c) => !before.includes(c)),
        removed: before.filter((c) => !after.includes(c)),
      },
    });
    return {
      role,
      permissions: after,
    };
  }
}
