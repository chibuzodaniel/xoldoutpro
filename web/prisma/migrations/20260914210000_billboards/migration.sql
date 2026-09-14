-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'BILLBOARD_FEE';

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "billboardDailyRateKobo" INTEGER NOT NULL DEFAULT 500000;

-- AlterTable
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";
ALTER TABLE "Payment" ALTER COLUMN "orderId" DROP NOT NULL,
ADD COLUMN     "billboardId" TEXT;

-- AlterTable
ALTER TABLE "WalletLedgerEntry" ADD COLUMN     "billboardId" TEXT;

-- CreateEnum
CREATE TYPE "BillboardStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "Billboard" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT,
    "artworkUrl" TEXT NOT NULL,
    "status" "BillboardStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "isModeratorAdded" BOOLEAN NOT NULL DEFAULT false,
    "paidKobo" INTEGER NOT NULL DEFAULT 0,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "Billboard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Billboard_status_expiresAt_idx" ON "Billboard"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Billboard_creatorId_idx" ON "Billboard"("creatorId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_billboardId_key" ON "Payment"("billboardId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_billboardId_fkey" FOREIGN KEY ("billboardId") REFERENCES "Billboard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_billboardId_fkey" FOREIGN KEY ("billboardId") REFERENCES "Billboard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Billboard" ADD CONSTRAINT "Billboard_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
