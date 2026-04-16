import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from './permissions.service';
import { PERMISSIONS_KEY } from './require-permissions.decorator';

/**
 * Guard that enforces `@RequirePermissions(...)` metadata.
 *
 * Runs AFTER JwtAuthGuard (expects `request.user.role`). Admin users
 * always pass (the service short-circuits to `*`). If no permissions
 * were declared on the route, the guard allows through — so existing
 * endpoints without a decorator keep working unchanged.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.role) {
      throw new ForbiddenException('用户身份缺失');
    }

    const granted = await this.permissionsService.getPermissionsForRole(
      user.role,
    );
    for (const code of required) {
      if (!PermissionsService.hasPermission(granted, code)) {
        throw new ForbiddenException(`缺少权限: ${code}`);
      }
    }
    return true;
  }
}
