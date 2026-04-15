-- Add cost_types (multi-value text array) and floor_price to orders
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "cost_types" text[] NOT NULL DEFAULT '{}';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "floor_price" DECIMAL(12,2);
