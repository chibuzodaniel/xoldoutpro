-- CreateEnum
CREATE TYPE "CreatorPlan" AS ENUM ('UNLIMITED', 'BUYER_PAYS_FEE', 'LIMITED');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'CREATOR_PLAN_FEE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "creatorPlan" "CreatorPlan",
ADD COLUMN     "limitedUploadsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "limitedSalesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "limitedPlanActivatedAt" TIMESTAMP(3),
ADD COLUMN     "buyerPaysFeeBonusSlots" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlatformSettings" ALTER COLUMN "commissionReleasePercent" SET DEFAULT 15,
ALTER COLUMN "commissionBeatPercent" SET DEFAULT 15,
ALTER COLUMN "commissionMerchPercent" SET DEFAULT 15,
ALTER COLUMN "commissionEventPercent" SET DEFAULT 15,
ADD COLUMN     "buyerPaysFeePercent" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "buyerPaysFeeUploadCap" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "buyerPaysFeeSlotPackSize" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "buyerPaysFeeSlotPackFeeKobo" INTEGER NOT NULL DEFAULT 400000,
ADD COLUMN     "limitedPlanFeeKobo" INTEGER NOT NULL DEFAULT 400000,
ADD COLUMN     "limitedPlanUploadCap" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "limitedPlanSalesCap" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "commissionOverrideKobo" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "creatorPlanUserId" TEXT,
ADD COLUMN     "creatorPlanPaymentKind" TEXT;
