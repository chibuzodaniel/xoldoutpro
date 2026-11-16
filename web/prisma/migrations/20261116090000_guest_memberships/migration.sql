-- Guest membership checkout (2026-11-16). Additive only.
-- A community's own join page: headline and benefits shown above its plans.
ALTER TABLE "FanbaseGroup" ADD COLUMN "joinHeadline" TEXT;
ALTER TABLE "FanbaseGroup" ADD COLUMN "joinBenefits" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- One row per guest membership purchase: links the payment, the buyer row and
-- the secure claim link (token) used to create the account afterwards.
CREATE TABLE "GuestMembershipClaim" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "paymentRef" TEXT,
    "emailedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GuestMembershipClaim_pkey" PRIMARY KEY ("token")
);
CREATE UNIQUE INDEX "GuestMembershipClaim_paymentRef_key" ON "GuestMembershipClaim"("paymentRef");
CREATE INDEX "GuestMembershipClaim_userId_idx" ON "GuestMembershipClaim"("userId");
CREATE INDEX "GuestMembershipClaim_email_idx" ON "GuestMembershipClaim"("email");
