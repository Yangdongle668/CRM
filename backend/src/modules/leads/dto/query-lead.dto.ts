import { IsOptional, IsString, IsInt, Min, IsEnum, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStage } from './create-lead.dto';

export class QueryLeadDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}
