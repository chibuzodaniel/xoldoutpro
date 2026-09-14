-- Postgres can't drop enum values in place, so recreate the type with only
-- SILVER/GOLD. Any existing row using a now-removed tier (BRONZE/PLATINUM)
-- is dropped first — these were only ever lazily-upserted defaults, never
-- user data.
DELETE FROM "AmbassadorTierRate" WHERE "tier"::text NOT IN ('SILVER', 'GOLD');

ALTER TYPE "AmbassadorTier" RENAME TO "AmbassadorTier_old";
CREATE TYPE "AmbassadorTier" AS ENUM ('SILVER', 'GOLD');
ALTER TABLE "AmbassadorTierRate" ALTER COLUMN "tier" TYPE "AmbassadorTier" USING ("tier"::text::"AmbassadorTier");
DROP TYPE "AmbassadorTier_old";

-- Split the single flat rate into a first-purchase rate and a lower
-- continuous rate, backfilling both from whatever the old single rate was
-- so an existing row keeps paying the same amount until a moderator
-- deliberately changes it.
ALTER TABLE "AmbassadorTierRate" ADD COLUMN "firstPurchasePercent" INTEGER;
ALTER TABLE "AmbassadorTierRate" ADD COLUMN "continuousPercent" INTEGER;
UPDATE "AmbassadorTierRate" SET "firstPurchasePercent" = "percent", "continuousPercent" = "percent";
ALTER TABLE "AmbassadorTierRate" ALTER COLUMN "firstPurchasePercent" SET NOT NULL;
ALTER TABLE "AmbassadorTierRate" ALTER COLUMN "continuousPercent" SET NOT NULL;
ALTER TABLE "AmbassadorTierRate" DROP COLUMN "percent";
