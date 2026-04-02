-- CreateEnum for PIStatus
CREATE TYPE "PIStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum for TradeTermType
CREATE TYPE "TradeTermType" AS ENUM ('EXW', 'FOB', 'CIF', 'CIP', 'DPU', 'DDP', 'FCA', 'FAS', 'CFR');

-- CreateEnum for PaymentTermType
CREATE TYPE "PaymentTermType" AS ENUM ('T_30', 'T_50', 'T_70', 'T_100');

-- CreateTable for ProformaInvoice
CREATE TABLE "proforma_invoices" (
    "id" TEXT NOT NULL,
    "pi_no" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" "PIStatus" NOT NULL DEFAULT 'DRAFT',
    "seller_id" TEXT,
    "seller_address" TEXT,
    "consignee_name" TEXT,
    "consignee_address" TEXT,
    "po_no" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trade_term" "TradeTermType",
    "payment_term" "PaymentTermType",
    "shipping_method" TEXT,
    "port_of_loading" TEXT,
    "port_of_discharge" TEXT,
    "place_of_delivery" TEXT,
    "payment_method" TEXT,
    "validity_period" INTEGER NOT NULL DEFAULT 7,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_charge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "other" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "approver_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable for ProformaInvoiceItem
CREATE TABLE "proforma_invoice_items" (
    "id" TEXT NOT NULL,
    "pi_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "description" TEXT,
    "hsn" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proforma_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for proforma_invoices
CREATE UNIQUE INDEX "proforma_invoices_pi_no_key" ON "proforma_invoices"("pi_no");
CREATE INDEX "proforma_invoices_pi_no_idx" ON "proforma_invoices"("pi_no");
CREATE INDEX "proforma_invoices_customer_id_idx" ON "proforma_invoices"("customer_id");
CREATE INDEX "proforma_invoices_owner_id_idx" ON "proforma_invoices"("owner_id");
CREATE INDEX "proforma_invoices_status_idx" ON "proforma_invoices"("status");

-- CreateIndex for proforma_invoice_items
CREATE INDEX "proforma_invoice_items_pi_id_idx" ON "proforma_invoice_items"("pi_id");

-- AddForeignKey for ProformaInvoice
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey for ProformaInvoiceItem
ALTER TABLE "proforma_invoice_items" ADD CONSTRAINT "proforma_invoice_items_pi_id_fkey" FOREIGN KEY ("pi_id") REFERENCES "proforma_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
