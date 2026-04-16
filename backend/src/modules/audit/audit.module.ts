import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Global Audit Log module.
 * - `AuditService` is @Global-exported so any module can call
 *   `auditService.logFromRequest(req, ...)` without re-importing.
 * - `AuditController` exposes GET /audit-logs (gated by audit:read).
 */
@Global()
@Module({
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
