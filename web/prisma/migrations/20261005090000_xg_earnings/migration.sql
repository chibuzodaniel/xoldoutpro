-- Xoldout Live: creators' received XG accrues in XgEarning at a
-- moderator-editable rate (default ₦6/XG) and converts to the wallet monthly.
ALTER TYPE "LedgerKind" ADD VALUE 'XG_EARNINGS_PAYOUT';

ALTER TABLE "PlatformSettings" ADD COLUMN "xgPayoutRateKobo" INTEGER NOT NULL DEFAULT 600;

CREATE TYPE "XgEarningSource" AS ENUM ('LIVE_GIFT', 'LIVE_ACCESS', 'LIVE_REQUEST');

CREATE TABLE "XgEarning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xgAmount" INTEGER NOT NULL,
    "koboPerXg" INTEGER NOT NULL,
    "source" "XgEarningSource" NOT NULL,
    "liveSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    "walletLedgerEntryId" TEXT,

    CONSTRAINT "XgEarning_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "XgEarning_userId_convertedAt_idx" ON "XgEarning"("userId", "convertedAt");
CREATE INDEX "XgEarning_convertedAt_createdAt_idx" ON "XgEarning"("convertedAt", "createdAt");

ALTER TABLE "XgEarning" ADD CONSTRAINT "XgEarning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
