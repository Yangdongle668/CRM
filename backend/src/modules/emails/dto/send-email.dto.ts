import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEmail,
  IsBoolean,
  IsArray,
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

  /**
   * 附件。前端通过 POST /documents/upload 先上传文件拿到 Document.id，
   * 再把一组 id 丢进来。服务器端会把这些 Document 标记为本邮件的附件
   * （relatedType='email', relatedId=emailId），然后 SMTP 发送时以
   * nodemailer attachments 的形式随邮件发出。
   */
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  attachmentIds?: string[];
}
