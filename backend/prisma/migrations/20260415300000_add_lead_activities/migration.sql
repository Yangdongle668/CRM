-- CreateTable: lead_activities
-- Referenced by LeadActivity model in schema.prisma

CREATE TABLE IF NOT EXISTS "lead_activities" (
  "id"         TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "lead_id"    TEXT NOT NULL,
  "owner_id"   TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "lead_activities"
  ADD CONSTRAINT "lead_activities_lead_id_fkey"
    FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_activities"
  ADD CONSTRAINT "lead_activities_owner_id_fkey"
    FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
