-- AlterTable: customers can be tagged with multiple battery models
ALTER TABLE "customers" ADD COLUMN "battery_models" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
