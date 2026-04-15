-- Drop the unique constraint on user_id in email_configs to allow multiple accounts per user
ALTER TABLE "email_configs" DROP CONSTRAINT IF EXISTS "email_configs_user_id_key";

-- Add email_addr column to email_configs (default to smtp_user for existing rows)
ALTER TABLE "email_configs" ADD COLUMN IF NOT EXISTS "email_addr" TEXT;
UPDATE "email_configs" SET "email_addr" = "smtp_user" WHERE "email_addr" IS NULL;
ALTER TABLE "email_configs" ALTER COLUMN "email_addr" SET NOT NULL;

-- Add new columns to emails table
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "email_config_id" TEXT;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "category" TEXT DEFAULT 'inbox';
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "flagged" BOOLEAN NOT NULL DEFAULT false;

-- Add foreign key from emails to email_configs with CASCADE delete
ALTER TABLE "emails" ADD CONSTRAINT "emails_email_config_id_fkey"
  FOREIGN KEY ("email_config_id") REFERENCES "email_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
