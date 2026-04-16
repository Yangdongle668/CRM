import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @MaxLength(60)
  alias: string;

  @IsString()
  bankInfoText: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateBankAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  alias?: string;

  @IsOptional()
  @IsString()
  bankInfoText?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
