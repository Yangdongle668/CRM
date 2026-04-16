-- Audit log table. Used to answer "who did what, when, from where?"
-- No FK to users.id so logs survive account deletion; snapshot the
-- user's email/name/role at write time for a self-contained trail.

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"            TEXT         NOT NULL,
    "user_id"       TEXT,
    "user_email"    TEXT,
    "user_name"     TEXT,
    "user_role"     TEXT,
    "action"        TEXT         NOT NULL,
    "target_type"   TEXT,
    "target_id"     TEXT,
    "target_label"  TEXT,
    "method"        TEXT,
    "path"          TEXT,
    "ip"            TEXT,
    "user_agent"    TEXT,
    "status"        TEXT         NOT NULL DEFAULT 'SUCCESS',
    "error_message" TEXT,
    "metadata"      JSONB,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx"  ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_target_type_target_id_idx"
    ON "audit_logs" ("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");
