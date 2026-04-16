-- Add `is_super_admin` flag on users.
-- On an existing install we auto-promote the oldest ADMIN to super admin
-- so there's always exactly one protected root account.

ALTER TABLE "users" ADD COLUMN "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users"
SET "is_super_admin" = true
WHERE id = (
    SELECT id FROM "users"
    WHERE role = 'ADMIN'
    ORDER BY created_at ASC, id ASC
    LIMIT 1
);
