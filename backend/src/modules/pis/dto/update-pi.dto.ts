import { IsString, IsUUID, IsOptional, IsNumber, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TradeTermType, PaymentTermType } from '@prisma/client';

class UpdatePIItemDto {
  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  hsn?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;
}

export class UpdatePIDto {
  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsString()
  sellerAddress?: string;

  @IsOptional()
  @IsString()
  consigneeName?: string;

  @IsOptional()
  @IsString()
  consigneeAddress?: string;

  @IsOptional()
  @IsString()
  poNo?: string;

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
  portOfLoading?: string;

  @IsOptional()
  @IsString()
  portOfDischarge?: string;

  @IsOptional()
  @IsString()
  placeOfDelivery?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  validityPeriod?: number;

  @IsOptional()
  @IsNumber()
  shippingCharge?: number;

  @IsOptional()
  @IsNumber()
  other?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdatePIItemDto)
  items?: UpdatePIItemDto[];
}
