-- CreateTable: messages (internal user-to-user messaging)

CREATE TABLE IF NOT EXISTS "messages" (
  "id"         TEXT NOT NULL,
  "from_id"    TEXT NOT NULL,
  "to_id"      TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "is_read"    BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "messages_to_id_is_read_idx" ON "messages"("to_id", "is_read");
CREATE INDEX IF NOT EXISTS "messages_from_id_idx"        ON "messages"("from_id");

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_from_id_fkey"
    FOREIGN KEY ("from_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_to_id_fkey"
    FOREIGN KEY ("to_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
