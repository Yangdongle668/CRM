-- 邮件模块：Message-ID 改为按邮箱账户唯一；模板加创建人；新增译文缓存表。
-- 现有数据的 message_id 全局唯一，天然满足新的 (email_config_id, message_id) 约束。

-- DropIndex
DROP INDEX "emails_message_id_key";

-- AlterTable
ALTER TABLE "email_templates" ADD COLUMN     "created_by_id" TEXT;

-- CreateTable
CREATE TABLE "email_translations" (
    "id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "target_lang" TEXT NOT NULL,
    "source_lang" TEXT,
    "source_hash" TEXT NOT NULL,
    "segments" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_translations_email_id_target_lang_key" ON "email_translations"("email_id", "target_lang");

-- CreateIndex
CREATE INDEX "emails_message_id_idx" ON "emails"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "emails_email_config_id_message_id_key" ON "emails"("email_config_id", "message_id");

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_translations" ADD CONSTRAINT "email_translations_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

