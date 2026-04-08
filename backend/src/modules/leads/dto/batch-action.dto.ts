import { IsArray, IsUUID, IsOptional, IsString } from 'class-validator';

export class BatchActionDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];

  @IsOptional()
  @IsUUID()
  ownerId?: string;
}

export class CreateLeadActivityDto {
  @IsString()
  content: string;
}

export class AssignLeadDto {
  @IsUUID()
  ownerId: string;
}
