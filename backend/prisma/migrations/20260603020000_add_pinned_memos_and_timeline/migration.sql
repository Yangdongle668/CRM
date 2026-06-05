-- AlterTable: pinned + status fields for follow-up memos
ALTER TABLE "memos" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "memos" ADD COLUMN "pinned_status" TEXT DEFAULT 'ACTIVE';

-- CreateIndex: filter pinned vs daily quickly per owner
CREATE INDEX "memos_owner_id_pinned_idx" ON "memos"("owner_id", "pinned");

-- CreateTable: timeline of contact events for a follow-up memo
CREATE TABLE "memo_timeline_entries" (
    "id" TEXT NOT NULL,
    "memo_id" TEXT NOT NULL,
    "contacted_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memo_timeline_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memo_timeline_entries_memo_id_contacted_at_idx" ON "memo_timeline_entries"("memo_id", "contacted_at");

ALTER TABLE "memo_timeline_entries" ADD CONSTRAINT "memo_timeline_entries_memo_id_fkey"
    FOREIGN KEY ("memo_id") REFERENCES "memos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
