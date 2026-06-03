-- AlterTable: add customer_code column to customers
ALTER TABLE "customers" ADD COLUMN "customer_code" TEXT;

-- CreateIndex: enforce uniqueness on customer_code
CREATE UNIQUE INDEX "customers_customer_code_key" ON "customers"("customer_code");

-- CreateTable: per-letter monotonically-increasing sequence counter
CREATE TABLE "customer_code_sequences" (
    "letter" TEXT NOT NULL,
    "next_seq" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_code_sequences_pkey" PRIMARY KEY ("letter")
);
