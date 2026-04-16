import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PERMISSION_CATALOG,
  DEFAULT_ROLE_PERMISSIONS,
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
 * Admin special case: `ADMIN` role always resolves to `['*']` without a
 * DB lookup, so a fresh install or a misconfigured table can never lock
 * admins out.
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
   * Inserts the catalog + default mappings if the tables are empty.
   * Safe to call multiple times — uses upsert on `code`.
   */
  async seedIfEmpty(): Promise<void> {
    try {
      const existing = await this.prisma.permission.count();
      if (existing === 0) {
        this.logger.log(
          `Seeding ${PERMISSION_CATALOG.length} permissions + default role mappings`,
        );
      }
      // Always upsert so new catalog entries appear without wiping custom rows.
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

      // Seed default role -> permission mappings only if *that role* has
      // no rows yet. This lets admins customise mappings without the seed
      // overwriting their edits on next boot.
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

  /**
   * Resolve the complete set of permission codes for a role, cached.
   * ADMIN always returns `{ '*' }`.
   */
  async getPermissionsForRole(role: string): Promise<Set<string>> {
    if (!role) return new Set();
    if (role === 'ADMIN') return new Set([WILDCARD]);

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
