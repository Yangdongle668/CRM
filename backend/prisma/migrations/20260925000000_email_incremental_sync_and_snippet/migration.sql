-- 邮件模块阶段 2：IMAP 按 UID 增量同步游标、账户同步状态、列表预览 snippet。
-- snippet 不在迁移里回填（大表上正则处理正文会很慢、阻塞启动），由应用启动后分批回填。

-- AlterTable
ALTER TABLE "email_configs" ADD COLUMN     "last_sync_at" TIMESTAMP(3),
ADD COLUMN     "last_sync_attempt_at" TIMESTAMP(3),
ADD COLUMN     "last_sync_error" TEXT,
ADD COLUMN     "sync_fail_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "snippet" TEXT;

-- CreateTable
CREATE TABLE "email_sync_states" (
    "id" TEXT NOT NULL,
    "email_config_id" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "uid_validity" TEXT NOT NULL,
    "last_uid" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_sync_states_email_config_id_folder_key" ON "email_sync_states"("email_config_id", "folder");

-- AddForeignKey
ALTER TABLE "email_sync_states" ADD CONSTRAINT "email_sync_states_email_config_id_fkey" FOREIGN KEY ("email_config_id") REFERENCES "email_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

