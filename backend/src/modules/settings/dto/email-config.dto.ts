import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  Max,
} from 'class-validator';

export class EmailConfigDto {
  @IsString()
  @IsNotEmpty()
  smtpHost: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort: number;

  @IsString()
  @IsNotEmpty()
  smtpUser: string;

  @IsString()
  @IsNotEmpty()
  smtpPass: string;

  @IsBoolean()
  @IsOptional()
  smtpSecure?: boolean;

  @IsString()
  @IsNotEmpty()
  imapHost: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort: number;

  @IsString()
  @IsNotEmpty()
  imapUser: string;

  @IsString()
  @IsNotEmpty()
  imapPass: string;

  @IsBoolean()
  @IsOptional()
  imapSecure?: boolean;

  @IsString()
  @IsOptional()
  fromName?: string;

  @IsString()
  @IsOptional()
  signature?: string;
}
