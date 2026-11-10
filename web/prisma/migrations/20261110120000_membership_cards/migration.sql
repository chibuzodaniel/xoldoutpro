-- Communities part 2: membership cards and suspensions. Additive only.
ALTER TABLE "Membership" ADD COLUMN "cardCode" TEXT;
ALTER TABLE "Membership" ADD COLUMN "suspendedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Membership_cardCode_key" ON "Membership"("cardCode");
