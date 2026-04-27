import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BUILTIN_ROLES,
  BUILTIN_ROLE_CODES,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  WILDCARD,
} from './permissions.catalog';

/**
 * Central permission resolver for the backend.
 *
 * - On boot: seeds the Permission catalog + default RolePermission rows
 *   if the tables are empty. Idempotent / safe to run repeatedly.
 * - Caches per-role permission sets in memory for fast guard checks.
 *   The cache is invalidated via `invalidateRole(role)` whenever an
 *   administrator changes the mapping.
 *
 * 超级管理员（User.isSuperAdmin=true）永远拥有 `*`，不依赖任何
 * RolePermission 行——确保配置错乱时也不会被自己锁在外面。
 * ADMIN role 已经不再"特殊照顾"，它的默认权限通过 seedIfEmpty 写入
 * RolePermission 行，可由超级管理员在 /admin/rbac 里调整。
 */
@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name);
  private cache = new Map<string, Set<string>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedIfEmpty();
  }

  /**
   * Inserts the catalog + built-in roles + default mappings on boot.
   * Safe to call multiple times — uses upsert semantics.
   */
  async seedIfEmpty(): Promise<void> {
    try {
      // 1) Permissions catalog
      for (const p of PERMISSION_CATALOG) {
        await this.prisma.permission.upsert({
          where: { code: p.code },
          update: {
            name: p.name,
            description: p.description,
            category: p.category,
          },
          create: p,
        });
      }

      // 2) Built-in roles — upsert name/description, force isBuiltin=true.
      for (const r of BUILTIN_ROLES) {
        await this.prisma.role.upsert({
          where: { code: r.code },
          update: {
            name: r.name,
            description: r.description,
            isBuiltin: true,
          },
          create: {
            code: r.code,
            name: r.name,
            description: r.description,
            isBuiltin: true,
          },
        });
      }

      // 3) 默认 role -> permission 映射，只在该角色 rolePermission 表里
      //    一行都没有时才写入。这一步对老库尤其关键：之前 ADMIN 走的是
      //    代码层通配符特例、表里根本没数据，直接重启会让 ADMIN 变成
      //    "什么都不能做"。这里检测到 ADMIN 行数 0 就用默认配置补齐。
      for (const [role, codes] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        const count = await this.prisma.rolePermission.count({
          where: { role },
        });
        if (count > 0) continue;
        const permissions = await this.prisma.permission.findMany({
          where: { code: { in: codes } },
          select: { id: true, code: true },
        });
        await this.prisma.rolePermission.createMany({
          data: permissions.map((p) => ({ role, permissionId: p.id })),
          skipDuplicates: true,
        });
        this.logger.log(
          `Seeded ${permissions.length} default permissions for role ${role}`,
        );
      }
    } catch (err: any) {
      // Non-fatal: most likely the migration hasn't been applied yet.
      this.logger.warn(
        `Permission seeding skipped: ${err?.message || err}`,
      );
    }
  }

  // -------- Role CRUD --------

  /**
   * List every role in the system (built-ins + custom) with its permission
   * count. Admin role is reported as having "all" permissions.
   */
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isBuiltin: 'desc' }, { code: 'asc' }],
    });
    const counts = await this.prisma.rolePermission.groupBy({
      by: ['role'],
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.role, c._count._all]));
    const userCounts = await this.prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });
    const userMap = new Map(userCounts.map((c) => [c.role, c._count._all]));

    return roles.map((r) => ({
      code: r.code,
      name: r.name,
      description: r.description,
      isBuiltin: r.isBuiltin,
      permissionCount: countMap.get(r.code) || 0,
      userCount: userMap.get(r.code) || 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getRole(code: string) {
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) throw new NotFoundException(`角色不存在: ${code}`);
    return role;
  }

  async createRole(input: { code: string; name: string; description?: string }) {
    const code = (input.code || '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(code)) {
      throw new BadRequestException(
        '角色 code 必须为 2~32 位大写字母/数字/下划线，且以字母开头',
      );
    }
    if (!input.name?.trim()) {
      throw new BadRequestException('角色名称不能为空');
    }
    const existing = await this.prisma.role.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException(`角色 code 已存在: ${code}`);
    }
    return this.prisma.role.create({
      data: {
        code,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        isBuiltin: false,
      },
    });
  }

  async updateRole(
    code: string,
    input: { name?: string; description?: string | null },
  ) {
    await this.getRole(code);
    return this.prisma.role.update({
      where: { code },
      data: {
        name: input.name?.trim(),
        description:
          input.description === undefined
            ? undefined
            : input.description?.trim() || null,
      },
    });
  }

  async deleteRole(code: string) {
    const role = await this.getRole(code);
    if (role.isBuiltin || BUILTIN_ROLE_CODES.includes(code)) {
      throw new ForbiddenException('内置角色不可删除');
    }
    const userCount = await this.prisma.user.count({ where: { role: code } });
    if (userCount > 0) {
      throw new BadRequestException(
        `该角色还有 ${userCount} 个用户在使用，请先迁移用户后再删除`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role: code } }),
      this.prisma.role.delete({ where: { code } }),
    ]);
    this.invalidateRole(code);
    return { deleted: true };
  }

  /**
   * Resolve the complete set of permission codes for a role, cached.
   * "全部权限"（`*`）已经不再绑定到 ADMIN role，而是绑定到
   * `User.isSuperAdmin = true`，由调用方通过 getPermissionsForUser 处理。
   */
  async getPermissionsForRole(role: string): Promise<Set<string>> {
    if (!role) return new Set();

    const cached = this.cache.get(role);
    if (cached) return cached;

    try {
      const rows = await this.prisma.rolePermission.findMany({
        where: { role },
        include: { permission: { select: { code: true } } },
      });
      const set = new Set(rows.map((r) => r.permission.code));
      this.cache.set(role, set);
      return set;
    } catch (err: any) {
      // DB table might not exist yet — fall back to the code-level defaults
      // so the app keeps working through the first migration deploy.
      this.logger.warn(
        `Falling back to in-memory role permissions (${role}): ${err?.message}`,
      );
      const fallback = new Set(DEFAULT_ROLE_PERMISSIONS[role] || []);
      return fallback;
    }
  }

  /** Returns the user's permission codes as a plain array (for API responses). */
  async listForRole(role: string): Promise<string[]> {
    const set = await this.getPermissionsForRole(role);
    return Array.from(set).sort();
  }

  /**
   * 用户层面的"实际授权集"。
   *   - 超级管理员（isSuperAdmin=true）：永远返回 `*`
   *   - 其他用户：按其 role 走 RolePermission 配置
   * Guards 和 /auth/me/permissions 都应走这个入口，而不是直接 byRole。
   */
  async getPermissionsForUser(user: {
    role: string;
    isSuperAdmin?: boolean;
  }): Promise<Set<string>> {
    if (user?.isSuperAdmin) return new Set([WILDCARD]);
    return this.getPermissionsForRole(user.role);
  }

  async listForUser(user: {
    role: string;
    isSuperAdmin?: boolean;
  }): Promise<string[]> {
    const set = await this.getPermissionsForUser(user);
    return Array.from(set).sort();
  }

  /**
   * Check whether a granted-set satisfies a required permission code,
   * supporting `*` and namespace wildcards like `customer:*`.
   */
  static hasPermission(granted: Set<string>, required: string): boolean {
    if (granted.has(WILDCARD)) return true;
    if (granted.has(required)) return true;
    const colon = required.indexOf(':');
    if (colon > 0) {
      const ns = `${required.slice(0, colon)}:*`;
      if (granted.has(ns)) return true;
    }
    return false;
  }

  async can(role: string, required: string): Promise<boolean> {
    const set = await this.getPermissionsForRole(role);
    return PermissionsService.hasPermission(set, required);
  }

  /** Invalidate a role's cached permission set (after RBAC edits). */
  invalidateRole(role: string) {
    this.cache.delete(role);
  }

  invalidateAll() {
    this.cache.clear();
  }
}
