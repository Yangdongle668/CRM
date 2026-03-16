import { IsString, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { QuotationStatus } from './update-quotation.dto';

export class QueryQuotationDto {
  @IsString()
  @IsOptional()
  customerId?: string;

  @IsEnum(QuotationStatus)
  @IsOptional()
  status?: QuotationStatus;

  @IsString()
  @IsOptional()
  keyword?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  pageSize?: number;
}
