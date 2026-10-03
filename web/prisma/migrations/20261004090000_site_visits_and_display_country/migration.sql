-- Display-currency preference (display only — charges stay NGN).
ALTER TABLE "User" ADD COLUMN "displayCountry" TEXT;

-- Moderator dashboard site visits: one row per (visitor, UTC day).
CREATE TABLE "SiteVisitorDay" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVisitorDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SiteVisitorDay_day_visitorHash_key" ON "SiteVisitorDay"("day", "visitorHash");
CREATE INDEX "SiteVisitorDay_day_country_idx" ON "SiteVisitorDay"("day", "country");
