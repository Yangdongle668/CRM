-- 邮件 AI 改为增量分析：记录每个客户已分析过的邮件
CREATE TABLE "customer_email_ai_processed" (
  "customer_id" TEXT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email_id" TEXT NOT NULL REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("customer_id", "email_id")
);
CREATE INDEX "customer_email_ai_processed_email_id_idx" ON "customer_email_ai_processed" ("email_id");

-- 旧的全量分析缓存不再使用
DROP TABLE "customer_email_analysis_batches";

-- 清除旧逻辑生成的 AI 跟进待办；上线后后台会为所有客户从头重跑一次分析
DELETE FROM "follow_ups" WHERE "id" LIKE 'email-ai-%';
