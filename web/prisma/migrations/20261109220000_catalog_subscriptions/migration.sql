-- Catalog subscriptions (v2, design/v2-prototype, 2026-11-09).
-- Additive only (new enum values, nullable/defaulted columns, new tables):
-- safe for the database preview and production share.

ALTER TYPE "LedgerKind" ADD VALUE 'SUBSCRIPTION_CREDIT';
ALTER TYPE "LedgerKind" ADD VALUE 'SUBSCRIPTION_COMMISSION_FEE';

ALTER TABLE "User" ADD COLUMN "catalogSubscriptionOn" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "WalletLedgerEntry" ADD COLUMN "subscriptionId" TEXT;

ALTER TABLE "Payment" ADD COLUMN "subscriptionSubscriberId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "subscriptionCreatorId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "subscriptionDurationDays" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "subscriptionAutoRenew" BOOLEAN;

ALTER TABLE "PlatformSettings" ADD COLUMN "commissionSubscriptionPercent" INTEGER NOT NULL DEFAULT 12;

CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogSubscription" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "renewalNotifiedAt" TIMESTAMP(3),
    "cardToken" TEXT,
    "cardProcessor" TEXT,
    "cardEmail" TEXT,
    "lastChargeAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_creatorId_durationDays_key" ON "SubscriptionPlan"("creatorId", "durationDays");
CREATE UNIQUE INDEX "CatalogSubscription_subscriberId_creatorId_key" ON "CatalogSubscription"("subscriberId", "creatorId");
CREATE INDEX "CatalogSubscription_creatorId_currentPeriodEnd_idx" ON "CatalogSubscription"("creatorId", "currentPeriodEnd");
CREATE INDEX "CatalogSubscription_autoRenew_currentPeriodEnd_idx" ON "CatalogSubscription"("autoRenew", "currentPeriodEnd");

ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogSubscription" ADD CONSTRAINT "CatalogSubscription_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogSubscription" ADD CONSTRAINT "CatalogSubscription_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
