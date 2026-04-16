import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'Get all users' })
  @ApiQuery({ name: 'role', required: false })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('role') role?: string,
    @Query('isActive') isActive?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.findAll({
      role,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get(':id')
  @RequirePermissions('user:read')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  @ApiOperation({ summary: 'Update user' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ) {
    let before: any = null;
    try {
      before = await this.usersService.findOne(id);
    } catch {}
    const result = await this.usersService.update(id, dto);
    await this.auditService.logFromRequest(req, {
      action: 'user.update',
      targetType: 'user',
      targetId: id,
      targetLabel: (result as any)?.email || (before as any)?.email || null,
      metadata: {
        changedFields: Object.keys(dto || {}),
        roleChange:
          before && (dto as any)?.role && (before as any).role !== (dto as any).role
            ? { before: (before as any).role, after: (dto as any).role }
            : undefined,
      },
    });
    return result;
  }

  @Delete(':id')
  @RequirePermissions('user:delete')
  @ApiOperation({ summary: 'Delete user' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    let label: string | null = null;
    try {
      const existing = await this.usersService.findOne(id);
      label = (existing as any)?.email ?? null;
    } catch {}
    try {
      const result = await this.usersService.remove(id);
      await this.auditService.logFromRequest(req, {
        action: 'user.delete',
        targetType: 'user',
        targetId: id,
        targetLabel: label,
      });
      return result;
    } catch (err: any) {
      await this.auditService.logFromRequest(req, {
        action: 'user.delete',
        targetType: 'user',
        targetId: id,
        targetLabel: label,
        status: 'FAILURE',
        errorMessage: err?.message || String(err),
      });
      throw err;
    }
  }
}
