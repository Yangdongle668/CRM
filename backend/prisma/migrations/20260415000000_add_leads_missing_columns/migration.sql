-- Add all columns that exist in the Prisma schema but were missing from the initial leads table

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company_name" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_name" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_title" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "industry" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company_size" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "is_public_pool" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "estimated_value" DECIMAL(12,2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT 'USD';
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_contact_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "next_follow_up_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Make owner_id nullable (was NOT NULL in 0_init)
ALTER TABLE "leads" ALTER COLUMN "owner_id" DROP NOT NULL;
