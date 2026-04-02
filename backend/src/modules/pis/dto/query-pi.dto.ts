import { IsOptional, IsString, IsNumber, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PIStatus } from '@prisma/client';

export class QueryPIDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(PIStatus)
  status?: PIStatus;

  @IsOptional()
  @IsString()
  keyword?: string;
}
