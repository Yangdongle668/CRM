import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentTermType, TradeTermType } from '@prisma/client';

export class CreatePITemplateDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(TradeTermType)
  tradeTerm?: TradeTermType;

  @IsOptional()
  @IsEnum(PaymentTermType)
  paymentTerm?: PaymentTermType;

  @IsOptional()
  @IsString()
  shippingMethod?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  portOfLoading?: string;

  @IsOptional()
  @IsString()
  portOfDischarge?: string;

  @IsOptional()
  @IsString()
  placeOfDelivery?: string;

  @IsOptional()
  @IsString()
  countryOfOrigin?: string;

  @IsOptional()
  @IsString()
  termsOfDelivery?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsInt()
  validityPeriod?: number;

  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdatePITemplateDto extends CreatePITemplateDto {
  @IsOptional()
  @IsString()
  declare name: string;
}
