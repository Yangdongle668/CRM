-- Add countryOfOrigin, termsOfDelivery, notes to proforma_invoices
ALTER TABLE "proforma_invoices" ADD COLUMN IF NOT EXISTS "country_of_origin" TEXT;
ALTER TABLE "proforma_invoices" ADD COLUMN IF NOT EXISTS "terms_of_delivery" TEXT;
ALTER TABLE "proforma_invoices" ADD COLUMN IF NOT EXISTS "notes" TEXT;
