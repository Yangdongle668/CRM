import { IsOptional, IsString, IsIn, MaxLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;
}

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsOptional()
  @IsIn(['DRAFT', 'SENDING', 'SENT', 'ARCHIVED'])
  status?: string;
}
