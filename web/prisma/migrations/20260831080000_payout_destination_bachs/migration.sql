ALTER TABLE "PayoutAccount" ADD COLUMN "payoutDestinationId" TEXT;
ALTER TABLE "PayoutAccount" ADD COLUMN "payoutDestinationUsable" BOOLEAN NOT NULL DEFAULT false;
