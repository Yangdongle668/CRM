-- 客户代码规则变更：从"所有客户都自动生成"改为"只有 ACTIVE 客户才生成"。
-- 同时新增行业"枪械运动" → O。
-- 重置策略：把所有已分配的代码清空、把字母计数器全部归零，让应用启动时
-- 的 backfill 钩子按 createdAt 升序为所有现存 ACTIVE 客户重新发号。
-- POTENTIAL / INACTIVE / BLACKLISTED 客户的 customer_code 保持为 NULL，
-- 等他们被推进到 ACTIVE 时由 update() 现场发号。
UPDATE "customers" SET "customer_code" = NULL;
DELETE FROM "customer_code_sequences";
