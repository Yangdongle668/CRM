CREATE TABLE "customer_email_analysis_batches" (
  "customer_id" TEXT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "owner_id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "result" JSONB NOT NULL,
  PRIMARY KEY ("customer_id", "owner_id", "fingerprint")
);
