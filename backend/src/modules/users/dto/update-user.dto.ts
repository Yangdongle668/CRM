import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'newpassword123' })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsString()
  @IsOptional()
  name?: string;

  // role 是 Role.code 字符串，运行期由 /admin/rbac 管理（含自定义角色）。
  // 这里不做 enum 校验，改由 UsersService 与 RBAC API 负责校验有效性。
  @ApiPropertyOptional({ example: 'SALESPERSON' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ example: '+1234567890' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({ example: '这是我的个性签名' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsObject()
  @IsOptional()
  preferences?: Record<string, any>;
}

/** DTO for self-service profile update — name and role are intentionally excluded */
export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  // 用户个人偏好：邮箱链接跳转方式、界面语言等（可扩展）。
  // 写入时会和已有偏好合并，不会整块替换。
  @IsObject()
  @IsOptional()
  preferences?: Record<string, any>;
}
