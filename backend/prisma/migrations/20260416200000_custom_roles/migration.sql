-- Custom roles:
--   1. Introduce a `roles` catalog so admins can create roles at runtime.
--   2. Convert `users.role` from the "Role" enum to TEXT so it can hold
--      any Role.code, including future custom ones.
--   3. Seed the three historic enum values as built-in rows.
-- The old "Role" enum type is left in place (unused) so downgrades don't
-- break; a later cleanup migration can DROP TYPE it.

CREATE TABLE IF NOT EXISTS "roles" (
    "id"          TEXT         NOT NULL,
    "code"        TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "is_builtin"  BOOLEAN      NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "roles_code_key" ON "roles" ("code");

INSERT INTO "roles" ("id", "code", "name", "description", "is_builtin", "updated_at")
VALUES
    (gen_random_uuid(), 'ADMIN',       '系统管理员', '内置角色，拥有全部权限（通配符 *）', true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'SALESPERSON', '销售员',    '内置角色：客户/线索/报价/订单管理',   true, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'FINANCE',     '财务人员',  '内置角色：订单 / 回款 / 形式发票',    true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
    "name"        = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "is_builtin"  = true,
    "updated_at"  = CURRENT_TIMESTAMP;

-- Convert users.role enum → text (values preserved verbatim).
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING "role"::text;
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'SALESPERSON';
