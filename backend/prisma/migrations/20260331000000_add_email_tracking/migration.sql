-- AlterEnum - EmailStatus
ALTER TYPE "EmailStatus" ADD VALUE 'VIEWED';

-- AlterTable - Email tracking fields
ALTER TABLE "emails" ADD COLUMN "viewed_at" TIMESTAMP(3),
ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;

-- AlterEnum - ActivityType new values
ALTER TYPE "ActivityType" ADD VALUE 'PRICE_DISCUSSION';
ALTER TYPE "ActivityType" ADD VALUE 'ORDER_INTENT';
ALTER TYPE "ActivityType" ADD VALUE 'SAMPLE';
ALTER TYPE "ActivityType" ADD VALUE 'MOLD_FEE';
ALTER TYPE "ActivityType" ADD VALUE 'PAYMENT';
ALTER TYPE "ActivityType" ADD VALUE 'SHIPPING';
ALTER TYPE "ActivityType" ADD VALUE 'COMPLAINT';
ALTER TYPE "ActivityType" ADD VALUE 'VISIT';
