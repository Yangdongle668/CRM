import {
  Body,
  Controller,
  Get,
  Put,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { RequirePermissions } from './require-permissions.decorator';
import { PERMISSION_CATALOG } from './permissions.catalog';
import { PrismaService } from '../../prisma/prisma.service';

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
  ) {
    if (role === 'ADMIN') {
      return {
        role,
        permissions: ['*'],
        message: 'ADMIN 角色默认拥有全部权限，无需配置',
      };
    }
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
    return {
      role,
      permissions: permissions.map((p) => p.code).sort(),
    };
  }
}
