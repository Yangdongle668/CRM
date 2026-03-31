import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  type: string;

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
