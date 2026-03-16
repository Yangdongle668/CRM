import { IsOptional, IsEnum, IsDateString, IsNumberString } from 'class-validator';
import { TaskPriority } from './create-task.dto';

export enum TaskStatusFilter {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class QueryTaskDto {
  @IsEnum(TaskStatusFilter)
  @IsOptional()
  status?: TaskStatusFilter;

  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @IsDateString()
  @IsOptional()
  dueDateFrom?: string;

  @IsDateString()
  @IsOptional()
  dueDateTo?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  pageSize?: string;
}
