-- Campaigns + Recipients: first-class entities so aggregate open/click
-- stats can be reported per outreach-batch and per contact address.

-- ---------- email_campaigns ----------
CREATE TABLE IF NOT EXISTS "email_campaigns" (
    "id"            TEXT         NOT NULL,
    "name"          TEXT         NOT NULL,
    "description"   TEXT,
    "created_by_id" TEXT         NOT NULL,
    "status"        TEXT         NOT NULL DEFAULT 'DRAFT',
    "sent_at"       TIMESTAMP(3),
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_campaigns_created_by_id_idx"
    ON "email_campaigns" ("created_by_id");

ALTER TABLE "email_campaigns"
    ADD CONSTRAINT "email_campaigns_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- email_recipients ----------
CREATE TABLE IF NOT EXISTS "email_recipients" (
    "id"              TEXT         NOT NULL,
    "email_addr"      TEXT         NOT NULL,
    "name"            TEXT,
    "customer_id"     TEXT,
    "contact_id"      TEXT,
    "first_seen_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sent_at"    TIMESTAMP(3),
    "last_opened_at"  TIMESTAMP(3),
    "last_clicked_at" TIMESTAMP(3),
    "total_sent"      INTEGER      NOT NULL DEFAULT 0,
    "total_opens"     INTEGER      NOT NULL DEFAULT 0,
    "total_clicks"    INTEGER      NOT NULL DEFAULT 0,
    CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_recipients_email_addr_key"
    ON "email_recipients" ("email_addr");

-- ---------- emails: add campaign_id / recipient_id ----------
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "campaign_id"  TEXT;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "recipient_id" TEXT;

CREATE INDEX IF NOT EXISTS "emails_campaign_id_idx"  ON "emails" ("campaign_id");
CREATE INDEX IF NOT EXISTS "emails_recipient_id_idx" ON "emails" ("recipient_id");

-- FK constraints. ON DELETE SET NULL so deleting a campaign / recipient
-- doesn't cascade-destroy the underlying email rows.
DO $$ BEGIN
  ALTER TABLE "emails"
    ADD CONSTRAINT "emails_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "emails"
    ADD CONSTRAINT "emails_recipient_id_fkey"
    FOREIGN KEY ("recipient_id") REFERENCES "email_recipients"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
