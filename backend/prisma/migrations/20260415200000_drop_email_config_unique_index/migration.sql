-- The 0_init migration created a unique index (not a constraint) on email_configs.user_id.
-- The previous multi-account migration used DROP CONSTRAINT which does not remove a
-- CREATE UNIQUE INDEX. Drop the index directly to allow multiple accounts per user.
DROP INDEX IF EXISTS "email_configs_user_id_key";
