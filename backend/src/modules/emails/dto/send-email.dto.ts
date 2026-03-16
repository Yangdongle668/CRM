import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEmail,
} from 'class-validator';

export class SendEmailDto {
  @IsString()
  @IsNotEmpty()
  toAddr: string;

  @IsString()
  @IsOptional()
  cc?: string;

  @IsString()
  @IsOptional()
  bcc?: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  bodyHtml: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;
}
