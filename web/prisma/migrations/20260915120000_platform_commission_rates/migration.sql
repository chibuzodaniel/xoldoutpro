-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "commissionReleasePercent" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "PlatformSettings" ADD COLUMN     "commissionBeatPercent" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "PlatformSettings" ADD COLUMN     "commissionMerchPercent" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "PlatformSettings" ADD COLUMN     "commissionEventPercent" INTEGER NOT NULL DEFAULT 5;
