import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEmail,
  IsBoolean,
} from 'class-validator';

export class SendEmailDto {
  @IsString()
  @IsNotEmpty()
  toAddr: string;

  @IsString()
  @IsOptional()
  cc?: string;

  @IsString()
  @IsOptional()
  bcc?: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  bodyHtml: string;

  @IsUUID()
  @IsOptional()
  customerId?: string;

  @IsUUID()
  @IsOptional()
  inReplyTo?: string;

  @IsUUID()
  @IsOptional()
  emailConfigId?: string;

  /** Optional marketing / outreach campaign this email belongs to. */
  @IsUUID()
  @IsOptional()
  campaignId?: string;

  /**
   * 前端（ComposeWindow）已经把签名可视化嵌入到了正文里，传 true 让
   * 服务器端跳过自动追加签名，避免收件人看到重复的签名块。
   */
  @IsBoolean()
  @IsOptional()
  skipSignatureAppend?: boolean;
}
