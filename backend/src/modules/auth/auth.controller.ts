import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { Request } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SetupDto } from './dto/setup.dto';
import { UsersService } from '../users/users.service';
import { UpdateProfileDto } from '../users/dto/update-user.dto';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';

const avatarStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  @Get('check-init')
  @ApiOperation({ summary: 'Check if system is initialized' })
  async checkInit() {
    return this.authService.checkInit();
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initial admin setup (first run only)' })
  async setup(@Body() dto: SetupDto) {
    return this.authService.setup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    try {
      const result = await this.authService.login(dto);
      // Record login *after* success; stamp the real user we matched.
      await this.auditService.log({
        action: 'auth.login',
        userId: (result as any)?.user?.id ?? null,
        userEmail: (result as any)?.user?.email ?? dto.email,
        userName: (result as any)?.user?.name ?? null,
        userRole: (result as any)?.user?.role ?? null,
        method: req.method,
        path: req.originalUrl || req.url,
        ip: (AuditService as any).extractIp(req),
        userAgent:
          (req.headers['user-agent'] as string | undefined)?.slice(0, 500) ??
          null,
      });
      return result;
    } catch (err: any) {
      await this.auditService.log({
        action: 'auth.login',
        status: 'FAILURE',
        userEmail: dto?.email ?? null,
        errorMessage: err?.message || 'login failed',
        method: req.method,
        path: req.originalUrl || req.url,
        ip: (AuditService as any).extractIp(req),
        userAgent:
          (req.headers['user-agent'] as string | undefined)?.slice(0, 500) ??
          null,
      });
      throw err;
    }
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('user:create')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register new user (requires user:create permission)' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: any) {
    const profile = await this.usersService.findOne(user.id);
    // listForUser：超级管理员永远拿 `*`，普通用户走 RolePermission 配置。
    const permissions = await this.permissionsService.listForUser({
      role: (profile as any)?.role ?? user.role,
      isSuperAdmin: !!(profile as any)?.isSuperAdmin,
    });
    return { ...profile, permissions };
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own profile (password, phone, bio, avatar)' })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.update(user.id, dto);
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('avatar', { storage: avatarStorage }))
  @ApiOperation({ summary: 'Upload own avatar' })
  async uploadAvatar(
    @CurrentUser() user: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 })],
      }),
    )
    file: Express.Multer.File,
  ) {
    const avatarUrl = `/uploads/${file.filename}`;
    await this.usersService.update(user.id, { avatar: avatarUrl });
    return { avatarUrl };
  }
}
