import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsController } from './permissions.controller';

/**
 * Global RBAC module.
 * - Provides {@link PermissionsService} + {@link PermissionsGuard} to every
 *   module, so controllers only need `@RequirePermissions(...)` + import
 *   the guard via `@UseGuards`.
 * - Exposes `/auth/me/permissions` + `/rbac/*` endpoints for runtime
 *   configuration.
 */
@Global()
@Module({
  providers: [PermissionsService, PermissionsGuard],
  controllers: [PermissionsController],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
