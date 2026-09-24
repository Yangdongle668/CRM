import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEmail,
  IsBoolean,
  IsArray,
  IsISO8601,
  ValidateIf,
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

  /** 从草稿发送：直接把这份草稿转为待发送，不再新建一封 */
  @IsUUID()
  @IsOptional()
  draftId?: string;

  /** 定时发送（ISO 时间）。不传则在撤回窗口结束后发送 */
  @IsISO8601()
  @IsOptional()
  scheduledAt?: string;
}

/** 草稿自动保存：所有字段可选，只更新传了的字段 */
export class SaveDraftDto {
  @IsUUID()
  @IsOptional()
  draftId?: string;

  @IsUUID()
  @IsOptional()
  emailConfigId?: string;

  @IsString()
  @IsOptional()
  toAddr?: string;

  @IsString()
  @IsOptional()
  cc?: string;

  @IsString()
  @IsOptional()
  bcc?: string;

  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsOptional()
  bodyHtml?: string;

  /** 空串表示清除 */
  @IsOptional()
  @ValidateIf((o) => o.customerId !== '')
  @IsUUID()
  customerId?: string;

  /** 空串表示不再是回复 */
  @IsString()
  @IsOptional()
  inReplyTo?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  attachmentIds?: string[];
}
