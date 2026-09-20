-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "latestApkVersion" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN     "latestApkBuildNumber" INTEGER;
ALTER TABLE "PlatformSettings" ADD COLUMN     "latestApkUrl" TEXT;
ALTER TABLE "PlatformSettings" ADD COLUMN     "latestApkReleasedAt" TIMESTAMP(3);
