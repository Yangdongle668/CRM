-- Dynamic RBAC: Permission table + RolePermission mapping.
-- Roles themselves remain in the existing Role enum; this only adds the
-- permission layer so authorization can be managed at runtime.

CREATE TABLE IF NOT EXISTS "permissions" (
    "id"          TEXT         NOT NULL,
    "code"        TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "category"    TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "permissions_code_key"
    ON "permissions" ("code");

CREATE TABLE IF NOT EXISTS "role_permissions" (
    "id"            TEXT         NOT NULL,
    "role"          TEXT         NOT NULL,
    "permission_id" TEXT         NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "role_permissions_role_permission_id_key"
    ON "role_permissions" ("role", "permission_id");

CREATE INDEX IF NOT EXISTS "role_permissions_role_idx"
    ON "role_permissions" ("role");

ALTER TABLE "role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey"
    FOREIGN KEY ("permission_id")
    REFERENCES "permissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
