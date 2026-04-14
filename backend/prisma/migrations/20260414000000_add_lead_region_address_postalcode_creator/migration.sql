-- AlterTable
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_email" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "region" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "postal_code" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "creator_id" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'leads_creator_id_fkey'
  ) THEN
    ALTER TABLE "leads" ADD CONSTRAINT "leads_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
