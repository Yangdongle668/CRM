-- 邮件模块阶段 3：发信状态（排队 / 发送中 / 失败原因 / 定时）、草稿回复关联、
-- 文件夹与"客户"标签分离。
-- 需要 PostgreSQL 12+（一个迁移里给枚举加多个值）；docker-compose 用的是 16。

-- AlterEnum


ALTER TYPE "EmailStatus" ADD VALUE 'QUEUED';
ALTER TYPE "EmailStatus" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "reply_to_email_id" TEXT,
ADD COLUMN     "scheduled_at" TIMESTAMP(3);


-- "客户邮件"以前是一个文件夹（category = customer），导致客户来信不在收件箱里。
-- 现在客户只是标签（customer_id），文件夹回到收件箱 / 已发送。
UPDATE "emails"
SET "category" = CASE WHEN "direction" = 'INBOUND' THEN 'inbox' ELSE 'sent' END
WHERE "category" = 'customer';

-- 旧的"星标"分类并入红旗标记
UPDATE "emails"
SET "flagged" = true,
    "category" = CASE WHEN "direction" = 'INBOUND' THEN 'inbox' ELSE 'sent' END
WHERE "category" = 'starred';

-- 以前 DRAFT 表示"排队待发"。升级时还停在 DRAFT、又不在草稿箱里的外发邮件，
-- 就是当初没发出去的，标为失败，方便用户看到并重发。
UPDATE "emails"
SET "status" = 'FAILED',
    "last_error" = '升级前未完成发送，请确认后重发'
WHERE "status" = 'DRAFT'
  AND "direction" = 'OUTBOUND'
  AND COALESCE("category", '') <> 'drafts';
