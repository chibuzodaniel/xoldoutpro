-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'LIVE_GIFT_CREDIT';
ALTER TYPE "LedgerKind" ADD VALUE 'LIVE_ACCESS_CREDIT';
ALTER TYPE "LedgerKind" ADD VALUE 'LIVE_REQUEST_CREDIT';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "coinTopUpUserId" TEXT,
ADD COLUMN     "coinTopUpXgAmount" INTEGER;

-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "LiveGiftType" AS ENUM ('STAR', 'MIC', 'GRAMMY');

-- CreateEnum
CREATE TYPE "LiveRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "CoinLedgerKind" AS ENUM ('TOPUP_CREDIT', 'GIFT_DEBIT', 'PAID_ACCESS_DEBIT', 'PAID_REQUEST_DEBIT');

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageLadder" JSONB,
    "roomName" TEXT NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'LIVE',
    "isPaidAccess" BOOLEAN NOT NULL DEFAULT false,
    "priceXg" INTEGER NOT NULL DEFAULT 0,
    "pinnedProductId" TEXT,
    "peakViewers" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveGift" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "LiveGiftType" NOT NULL,
    "xgAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveGift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveAccessGrant" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xgPaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveAccessGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveRequest" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "xgAmount" INTEGER NOT NULL,
    "status" "LiveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xgAmount" INTEGER NOT NULL,
    "kind" "CoinLedgerKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_roomName_key" ON "LiveSession"("roomName");

-- CreateIndex
CREATE INDEX "LiveSession_creatorId_idx" ON "LiveSession"("creatorId");

-- CreateIndex
CREATE INDEX "LiveSession_status_idx" ON "LiveSession"("status");

-- CreateIndex
CREATE INDEX "LiveGift_liveSessionId_createdAt_idx" ON "LiveGift"("liveSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveGift_senderId_idx" ON "LiveGift"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveAccessGrant_liveSessionId_userId_key" ON "LiveAccessGrant"("liveSessionId", "userId");

-- CreateIndex
CREATE INDEX "LiveRequest_liveSessionId_status_idx" ON "LiveRequest"("liveSessionId", "status");

-- CreateIndex
CREATE INDEX "CoinLedgerEntry_userId_idx" ON "CoinLedgerEntry"("userId");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_pinnedProductId_fkey" FOREIGN KEY ("pinnedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGift" ADD CONSTRAINT "LiveGift_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGift" ADD CONSTRAINT "LiveGift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAccessGrant" ADD CONSTRAINT "LiveAccessGrant_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveAccessGrant" ADD CONSTRAINT "LiveAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRequest" ADD CONSTRAINT "LiveRequest_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveRequest" ADD CONSTRAINT "LiveRequest_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinLedgerEntry" ADD CONSTRAINT "CoinLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
