CREATE TABLE "customer_status_hidden_cards" (
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "customer_id" TEXT NOT NULL REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "hidden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "customer_id")
);
CREATE INDEX "customer_status_hidden_cards_customer_id_idx" ON "customer_status_hidden_cards" ("customer_id");
