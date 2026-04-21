-- Enable pg_trgm extension for fast ILIKE/LIKE queries with GIN indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==================== Customer ====================
CREATE INDEX IF NOT EXISTS idx_customers_company_name_trgm
  ON customers USING GIN (company_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_country_trgm
  ON customers USING GIN (country gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_remark_trgm
  ON customers USING GIN (remark gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_website_trgm
  ON customers USING GIN (website gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customers_owner_id
  ON customers (owner_id);

-- ==================== Lead ====================
CREATE INDEX IF NOT EXISTS idx_leads_title_trgm
  ON leads USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_company_name_trgm
  ON leads USING GIN (company_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_contact_name_trgm
  ON leads USING GIN (contact_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_contact_email_trgm
  ON leads USING GIN (contact_email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_description_trgm
  ON leads USING GIN (description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_notes_trgm
  ON leads USING GIN (notes gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_leads_owner_id
  ON leads (owner_id);

CREATE INDEX IF NOT EXISTS idx_leads_is_public_pool
  ON leads (is_public_pool);

-- ==================== Order ====================
CREATE INDEX IF NOT EXISTS idx_orders_order_no_trgm
  ON orders USING GIN (order_no gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_title_trgm
  ON orders USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_tracking_no_trgm
  ON orders USING GIN (tracking_no gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_remark_trgm
  ON orders USING GIN (remark gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_orders_owner_id
  ON orders (owner_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON orders (customer_id);

-- ==================== Email ====================
CREATE INDEX IF NOT EXISTS idx_emails_subject_trgm
  ON emails USING GIN (subject gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_emails_from_addr_trgm
  ON emails USING GIN (from_addr gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_emails_to_addr_trgm
  ON emails USING GIN (to_addr gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_emails_body_text_trgm
  ON emails USING GIN (body_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_emails_customer_id
  ON emails (customer_id);

CREATE INDEX IF NOT EXISTS idx_emails_sender_id
  ON emails (sender_id);

CREATE INDEX IF NOT EXISTS idx_emails_direction
  ON emails (direction);
