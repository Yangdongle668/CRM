-- Enforce that every element in cost_types is one of the allowed values.
-- The <@ operator checks that the array is contained by the allowed set.
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_cost_types_valid_check"
  CHECK ("cost_types" <@ ARRAY['模具','认证','货物','设备','NRE费用']::text[]);
