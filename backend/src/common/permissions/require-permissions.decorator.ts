import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Attach one or more permission codes required to invoke the route.
 *
 * Example:
 *   @RequirePermissions('customer:delete')
 *   @Delete(':id')
 *   remove(...) { ... }
 *
 * Multiple codes are treated as AND (user must hold every one).
 * Use wildcards like `customer:*` when defining role permissions, not
 * here — this decorator expects concrete codes.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
