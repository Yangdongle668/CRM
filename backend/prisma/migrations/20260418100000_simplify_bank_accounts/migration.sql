-- ==================== Simplify BankAccount ====================
-- The earlier structured schema (account_name / account_number / swift_code /
-- ...) was replaced by a single `bank_info_text` multi-line block + alias.
-- This migration reshapes an already-populated bank_accounts table:
--   1. add `bank_info_text` (nullable)
--   2. backfill from the old structured columns (if any)
--   3. make it NOT NULL
--   4. drop the obsolete columns
-- All steps are idempotent so a fresh install (where the earlier migration
-- never existed in the structured form) is still valid — nothing to do.

-- 1. Add the new column if it's not already there.
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "bank_info_text" TEXT;

-- 2. Backfill from the old structured columns. Only runs if those columns
--    still exist; on fresh installs the whole DO block is a no-op because
--    the columns are absent and bank_info_text already has the data.
DO $$
DECLARE
    has_account_name        BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bank_accounts' AND column_name = 'account_name'
    ) INTO has_account_name;

    IF has_account_name THEN
        UPDATE "bank_accounts" SET "bank_info_text" = COALESCE("bank_info_text", '') ||
            CASE WHEN "bank_info_text" IS NULL OR "bank_info_text" = '' THEN '' ELSE E'\n' END ||
            trim(BOTH E'\n' FROM
                CASE WHEN "account_number"  IS NOT NULL AND "account_number" <> '' THEN 'Account number: ' || "account_number" || E'\n' ELSE '' END ||
                CASE WHEN "account_name"    IS NOT NULL AND "account_name"   <> '' THEN 'Account name: '   || "account_name"   || E'\n' ELSE '' END ||
                CASE WHEN "swift_code"      IS NOT NULL AND "swift_code"     <> '' THEN 'SWIFT/BIC code: ' || "swift_code"     || E'\n' ELSE '' END ||
                CASE WHEN "iban"            IS NOT NULL AND "iban"           <> '' THEN 'IBAN: '           || "iban"           || E'\n' ELSE '' END ||
                CASE WHEN "routing_number"  IS NOT NULL AND "routing_number" <> '' THEN 'Routing number: ' || "routing_number" || E'\n' ELSE '' END ||
                CASE WHEN "bank_name"       IS NOT NULL AND "bank_name"      <> '' THEN 'Bank name: '      || "bank_name"      || E'\n' ELSE '' END ||
                CASE WHEN "branch_name"     IS NOT NULL AND "branch_name"    <> '' THEN 'Branch: '         || "branch_name"    || E'\n' ELSE '' END ||
                CASE WHEN "bank_address"    IS NOT NULL AND "bank_address"   <> '' THEN 'Bank address: '   || "bank_address"   || E'\n' ELSE '' END ||
                CASE WHEN "country"         IS NOT NULL AND "country"        <> '' THEN 'Country/region: ' || "country"        || E'\n' ELSE '' END ||
                CASE WHEN "currency"        IS NOT NULL AND "currency"       <> '' THEN 'Currency: '       || "currency"       || E'\n' ELSE '' END ||
                CASE WHEN "payment_memo"    IS NOT NULL AND "payment_memo"   <> '' THEN "payment_memo"     || E'\n' ELSE '' END ||
                CASE WHEN "extra_info"      IS NOT NULL AND "extra_info"     <> '' THEN "extra_info"       || E'\n' ELSE '' END
            );
    END IF;
END $$;

-- 3. Any row still without content gets a placeholder so NOT NULL holds.
UPDATE "bank_accounts" SET "bank_info_text" = "alias"
WHERE "bank_info_text" IS NULL OR "bank_info_text" = '';

-- 4. Lock NOT NULL.
ALTER TABLE "bank_accounts" ALTER COLUMN "bank_info_text" SET NOT NULL;

-- 5. Drop obsolete structured columns (IF EXISTS keeps it safe for fresh
--    installs where these columns were never created).
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "account_name";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "account_number";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "bank_name";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "bank_address";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "swift_code";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "currency";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "country";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "branch_name";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "routing_number";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "iban";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "payment_memo";
ALTER TABLE "bank_accounts" DROP COLUMN IF EXISTS "extra_info";
