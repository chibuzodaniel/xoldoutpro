-- Events marketplace: promoter applications/pay, discounts, lineup roles and
-- invitations, per-buyer ticket limits. Additive only.
ALTER TABLE "Event" ADD COLUMN "promotersOpen" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN "promoterPayType" TEXT NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Event" ADD COLUMN "promoterMinPercent" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Event" ADD COLUMN "promoterMaxPercent" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Event" ADD COLUMN "promoterFlatKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Event" ADD COLUMN "maxPerBuyer" INTEGER;

ALTER TABLE "TicketTier" ADD COLUMN "maxPerBuyer" INTEGER;

ALTER TABLE "EventPromoter" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "EventPromoter" ADD COLUMN "decidedAt" TIMESTAMP(3);
ALTER TABLE "EventPromoter" ADD COLUMN "clickCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "EventLineupEntry" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ARTIST';
ALTER TABLE "EventLineupEntry" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACCEPTED';
ALTER TABLE "EventLineupEntry" ADD COLUMN "respondedAt" TIMESTAMP(3);

CREATE TABLE "EventDiscount" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "isEarlyBird" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "tierIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventDiscount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EventDiscount_eventId_code_key" ON "EventDiscount"("eventId", "code");
CREATE INDEX "EventDiscount_eventId_idx" ON "EventDiscount"("eventId");
ALTER TABLE "EventDiscount" ADD CONSTRAINT "EventDiscount_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "promoterCommissionKobo" INTEGER;
ALTER TABLE "Order" ADD COLUMN "discountId" TEXT;
ALTER TABLE "Order" ADD COLUMN "discountKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "EventDiscount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Order_discountId_idx" ON "Order"("discountId");
