import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export enum ActivityType {
  NOTE = 'NOTE',
  CALL = 'CALL',
  MEETING = 'MEETING',
  EMAIL = 'EMAIL',
  TASK = 'TASK',
  STATUS_CHANGE = 'STATUS_CHANGE',
}

export class CreateActivityDto {
  @IsEnum(ActivityType)
  @IsNotEmpty()
  type: ActivityType;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  relatedType?: string;

  @IsString()
  @IsOptional()
  relatedId?: string;
}
