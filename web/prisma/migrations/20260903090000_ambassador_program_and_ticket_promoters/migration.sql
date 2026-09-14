-- CreateEnum
CREATE TYPE "AmbassadorApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AmbassadorTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'AMBASSADOR_COMMISSION';
ALTER TYPE "LedgerKind" ADD VALUE 'PROMOTER_CREDIT';
ALTER TYPE "LedgerKind" ADD VALUE 'PROMOTER_FEE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAmbassador" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ambassadorCode" TEXT,
ADD COLUMN     "referredByAmbassadorId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "promoterId" TEXT;

-- CreateTable
CREATE TABLE "AmbassadorApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pitch" TEXT,
    "status" "AmbassadorApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbassadorApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmbassadorTierRate" (
    "tier" "AmbassadorTier" NOT NULL,
    "percent" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AmbassadorTierRate_pkey" PRIMARY KEY ("tier")
);

-- CreateTable
CREATE TABLE "EventPromoter" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharePercent" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventPromoter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_ambassadorCode_key" ON "User"("ambassadorCode");

-- CreateIndex
CREATE INDEX "AmbassadorApplication_userId_status_idx" ON "AmbassadorApplication"("userId", "status");

-- CreateIndex
CREATE INDEX "AmbassadorApplication_status_idx" ON "AmbassadorApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EventPromoter_code_key" ON "EventPromoter"("code");

-- CreateIndex
CREATE INDEX "EventPromoter_eventId_idx" ON "EventPromoter"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPromoter_eventId_userId_key" ON "EventPromoter"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByAmbassadorId_fkey" FOREIGN KEY ("referredByAmbassadorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoterId_fkey" FOREIGN KEY ("promoterId") REFERENCES "EventPromoter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorApplication" ADD CONSTRAINT "AmbassadorApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmbassadorApplication" ADD CONSTRAINT "AmbassadorApplication_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPromoter" ADD CONSTRAINT "EventPromoter_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPromoter" ADD CONSTRAINT "EventPromoter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
