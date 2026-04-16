-- ==================== BankAccount ====================
-- One row per receiving account; `bank_info_text` is the multi-line block
-- that will be embedded verbatim into the PI PDF.
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "bank_info_text" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bank_accounts_is_default_idx" ON "bank_accounts"("is_default");
CREATE INDEX "bank_accounts_sort_order_idx" ON "bank_accounts"("sort_order");

-- ==================== PITemplate ====================
CREATE TABLE "pi_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT DEFAULT 'USD',
    "trade_term" "TradeTermType",
    "payment_term" "PaymentTermType",
    "shipping_method" TEXT,
    "payment_method" TEXT,
    "port_of_loading" TEXT,
    "port_of_discharge" TEXT,
    "place_of_delivery" TEXT,
    "country_of_origin" TEXT,
    "terms_of_delivery" TEXT,
    "notes" TEXT,
    "validity_period" INTEGER,
    "bank_account_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pi_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pi_templates_is_default_idx" ON "pi_templates"("is_default");
CREATE INDEX "pi_templates_sort_order_idx" ON "pi_templates"("sort_order");

ALTER TABLE "pi_templates" ADD CONSTRAINT "pi_templates_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==================== ProformaInvoice: add FK columns ====================
ALTER TABLE "proforma_invoices" ADD COLUMN "bank_account_id" TEXT;
ALTER TABLE "proforma_invoices" ADD COLUMN "template_id" TEXT;

CREATE INDEX "proforma_invoices_bank_account_id_idx" ON "proforma_invoices"("bank_account_id");
CREATE INDEX "proforma_invoices_template_id_idx" ON "proforma_invoices"("template_id");

ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_bank_account_id_fkey"
    FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "pi_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ==================== Backfill: legacy bank_info_text → default account ====================
DO $$
DECLARE
    legacy TEXT;
BEGIN
    SELECT "value" INTO legacy FROM "system_settings" WHERE "key" = 'bank_info_text';
    IF legacy IS NOT NULL AND length(trim(legacy)) > 0 THEN
        INSERT INTO "bank_accounts" ("id", "alias", "bank_info_text", "is_default", "sort_order", "created_at", "updated_at")
        VALUES (gen_random_uuid()::text, '默认银行账户', legacy, true, 0, now(), now());
    END IF;
END $$;
