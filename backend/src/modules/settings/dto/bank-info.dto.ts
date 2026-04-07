import { IsOptional, IsString } from 'class-validator';

export class BankInfoDto {
  @IsOptional()
  @IsString()
  bankInfoText?: string;
}
