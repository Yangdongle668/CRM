-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CN',
    "is_off" BOOLEAN NOT NULL DEFAULT false,
    "lunar" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holidays_year_idx" ON "holidays"("year");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_name_key" ON "holidays"("date", "name");
