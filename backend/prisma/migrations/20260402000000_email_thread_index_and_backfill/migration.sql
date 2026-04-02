-- CreateIndex for faster thread subject lookups
CREATE INDEX IF NOT EXISTS "email_threads_subject_idx" ON "email_threads"("subject");

-- Backfill: Create threads for all distinct normalized subjects from orphan emails
-- Step 1: Create EmailThread records for each distinct normalized subject
INSERT INTO "email_threads" ("id", "subject", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE("subject", '^(Re|Fwd|Fw|回复|转发)\s*[:：]\s*', '', 'gi'),
    '^(Re|Fwd|Fw|回复|转发)\s*[:：]\s*', '', 'gi'
  )),
  MIN("created_at"),
  NOW()
FROM "emails"
WHERE "thread_id" IS NULL
GROUP BY TRIM(REGEXP_REPLACE(
  REGEXP_REPLACE("subject", '^(Re|Fwd|Fw|回复|转发)\s*[:：]\s*', '', 'gi'),
  '^(Re|Fwd|Fw|回复|转发)\s*[:：]\s*', '', 'gi'
))
ON CONFLICT DO NOTHING;

-- Step 2: Assign threadId to all orphan emails by matching normalized subject
UPDATE "emails" e
SET "thread_id" = t."id"
FROM "email_threads" t
WHERE e."thread_id" IS NULL
  AND t."subject" = TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(e."subject", '^(Re|Fwd|Fw|回复|转发)\s*[:：]\s*', '', 'gi'),
    '^(Re|Fwd|Fw|回复|转发)\s*[:：]\s*', '', 'gi'
  ));
