-- Enterprise-grade email open/click tracking.
--   email_open_events  : one row per (deduped) pixel hit
--   email_click_events : one row per tracked link click
--   email_links        : per-email table of rewritten links (linkId → url)
-- Plus a few aggregate/confidence columns on emails itself.

-- ---------- Aggregate columns on emails ----------
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "first_human_open_at" TIMESTAMP(3);
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "last_opened_at"      TIMESTAMP(3);
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "total_clicks"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "open_confidence"     DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ---------- email_open_events ----------
CREATE TABLE IF NOT EXISTS "email_open_events" (
    "id"         TEXT         NOT NULL,
    "email_id"   TEXT         NOT NULL,
    "opened_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip"         TEXT,
    "user_agent" TEXT,
    "referer"    TEXT,
    "kind"       TEXT         NOT NULL DEFAULT 'HUMAN',
    "source"     TEXT         NOT NULL DEFAULT 'PIXEL',
    CONSTRAINT "email_open_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_open_events_email_id_idx"
    ON "email_open_events" ("email_id");
CREATE INDEX IF NOT EXISTS "email_open_events_opened_at_idx"
    ON "email_open_events" ("opened_at");

ALTER TABLE "email_open_events"
    ADD CONSTRAINT "email_open_events_email_id_fkey"
    FOREIGN KEY ("email_id")
    REFERENCES "emails"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- email_click_events ----------
CREATE TABLE IF NOT EXISTS "email_click_events" (
    "id"         TEXT         NOT NULL,
    "email_id"   TEXT         NOT NULL,
    "link_id"    TEXT         NOT NULL,
    "url"        TEXT         NOT NULL,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip"         TEXT,
    "user_agent" TEXT,
    "referer"    TEXT,
    "kind"       TEXT         NOT NULL DEFAULT 'HUMAN',
    CONSTRAINT "email_click_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_click_events_email_id_idx"
    ON "email_click_events" ("email_id");
CREATE INDEX IF NOT EXISTS "email_click_events_clicked_at_idx"
    ON "email_click_events" ("clicked_at");

ALTER TABLE "email_click_events"
    ADD CONSTRAINT "email_click_events_email_id_fkey"
    FOREIGN KEY ("email_id")
    REFERENCES "emails"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- email_links ----------
CREATE TABLE IF NOT EXISTS "email_links" (
    "id"       TEXT    NOT NULL,
    "email_id" TEXT    NOT NULL,
    "link_id"  TEXT    NOT NULL,
    "url"      TEXT    NOT NULL,
    "label"    TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "email_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_links_email_id_link_id_key"
    ON "email_links" ("email_id", "link_id");
CREATE INDEX IF NOT EXISTS "email_links_email_id_idx"
    ON "email_links" ("email_id");

ALTER TABLE "email_links"
    ADD CONSTRAINT "email_links_email_id_fkey"
    FOREIGN KEY ("email_id")
    REFERENCES "emails"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
