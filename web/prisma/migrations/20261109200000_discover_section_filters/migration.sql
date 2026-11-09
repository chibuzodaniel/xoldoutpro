-- Discover section chips (v2, design/v2-prototype). Additive, nullable only:
-- safe for the shared preview/production database.
ALTER TABLE "Beat" ADD COLUMN "genre" TEXT;
ALTER TABLE "Beat" ADD COLUMN "mood" TEXT;
ALTER TABLE "Event" ADD COLUMN "eventType" TEXT;
ALTER TABLE "Event" ADD COLUMN "city" TEXT;
ALTER TABLE "MerchItem" ADD COLUMN "category" TEXT;
