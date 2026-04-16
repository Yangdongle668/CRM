import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SetupDto } from './dto/setup.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async checkInit() {
    const userCount = await this.prisma.user.count();
    return { initialized: userCount > 0 };
  }

  async setup(dto: SetupDto) {
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      throw new ForbiddenException('系统已初始化，无法重复设置');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: 'ADMIN',
        phone: dto.phone,
        // The very first user on a fresh install is the super admin:
        // protected from deletion/demotion and used as the default
        // transfer target when other users are removed.
        isSuperAdmin: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        isActive: true,
        isSuperAdmin: true,
        createdAt: true,
      },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const permissions = await this.permissionsService.listForRole(user.role);
    return {
      token: this.jwtService.sign(payload),
      user: { ...user, permissions },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const permissions = await this.permissionsService.listForRole(user.role);
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        permissions,
      },
    };
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: dto.role,
        phone: dto.phone,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        isActive: true,
        createdAt: true,
      },
    });

    return user;
  }
}
