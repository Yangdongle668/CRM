CREATE TABLE "customer_email_analyses" (
    "customer_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "result" JSONB NOT NULL,
    CONSTRAINT "customer_email_analyses_pkey" PRIMARY KEY ("customer_id"),
    CONSTRAINT "customer_email_analyses_customer_id_fkey"
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
