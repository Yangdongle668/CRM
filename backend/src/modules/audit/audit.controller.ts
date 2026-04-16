import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { AuditService, QueryAuditLogInput } from './audit.service';

@ApiTags('审计')
@ApiBearerAuth('JWT-auth')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(@Query() query: any) {
    const q: QueryAuditLogInput = {
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
      userId: query.userId,
      action: query.action,
      targetType: query.targetType,
      targetId: query.targetId,
      status: query.status,
      from: query.from,
      to: query.to,
      search: query.search,
    };
    return this.auditService.query(q);
  }
}
