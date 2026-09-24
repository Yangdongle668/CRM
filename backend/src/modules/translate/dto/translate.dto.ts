import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TranslateSegmentDto {
  @IsInt()
  @Min(0)
  index: number;

  @IsString()
  @MaxLength(20000)
  text: string;
}

export class TranslateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TranslateSegmentDto)
  segments: TranslateSegmentDto[];

  /** 目标语言，如 zh-CN / en / es。 */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/)
  target?: string;

  /** 翻译的是哪封邮件：带上就按邮件缓存译文。 */
  @IsOptional()
  @IsUUID()
  emailId?: string;
}
