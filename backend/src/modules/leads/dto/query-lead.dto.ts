import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  IsEnum,
  IsUUID,
  IsBooleanString,
} from 'class-validator';
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

  @IsOptional()
  @IsBooleanString()
  isPublicPool?: string;

  @IsOptional()
  @IsString()
  scope?: 'mine' | 'pool' | 'all';

  @IsOptional()
  @IsString()
  sortBy?: 'updatedAt' | 'createdAt' | 'score';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
