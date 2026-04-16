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
    const codes = await this.permissionsService.listForRole(user.role);
    return { role: user.role, permissions: codes };
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
    if (role === 'ADMIN') {
      return {
        role,
        permissions: ['*'],
        message: 'ADMIN 角色默认拥有全部权限，无需配置',
      };
    }
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
