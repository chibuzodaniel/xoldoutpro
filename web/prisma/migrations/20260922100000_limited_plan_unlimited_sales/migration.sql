-- Explicit ask, 2026-09-22: the LIMITED plan has unlimited sales — there is
-- no sales cap, renewal is triggered only by hitting the upload limit. Also
-- corrects the UNLIMITED plan's per-type commission defaults (12% music/
-- beats/merch, 5% events — matching what production's singleton row
-- already held before an earlier, never-actually-applied default bump).

-- AlterTable
ALTER TABLE "User" DROP COLUMN "limitedSalesCount";

-- AlterTable
ALTER TABLE "PlatformSettings" DROP COLUMN "limitedPlanSalesCap",
ALTER COLUMN "commissionReleasePercent" SET DEFAULT 12,
ALTER COLUMN "commissionBeatPercent" SET DEFAULT 12,
ALTER COLUMN "commissionMerchPercent" SET DEFAULT 12,
ALTER COLUMN "commissionEventPercent" SET DEFAULT 5;
