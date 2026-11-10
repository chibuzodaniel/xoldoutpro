-- Communities, part 1 (v2, design/v2-prototype): Fanbases upgraded into
-- communities with channels and membership plans. Additive only (new enum
-- values, nullable/defaulted columns, new tables): safe for the database
-- preview and production share.

ALTER TYPE "LedgerKind" ADD VALUE 'MEMBERSHIP_CREDIT';
ALTER TYPE "LedgerKind" ADD VALUE 'MEMBERSHIP_COMMISSION_FEE';

ALTER TABLE "FanbaseGroup" ADD COLUMN "handle" TEXT;
ALTER TABLE "FanbaseGroup" ADD COLUMN "category" TEXT;
ALTER TABLE "FanbaseGroup" ADD COLUMN "bannerUrl" TEXT;
ALTER TABLE "FanbaseGroup" ADD COLUMN "location" TEXT;
ALTER TABLE "FanbaseGroup" ADD COLUMN "rules" TEXT;
ALTER TABLE "FanbaseGroup" ADD COLUMN "inviteCode" TEXT;
ALTER TABLE "FanbaseGroup" ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "FanbaseGroup_handle_key" ON "FanbaseGroup"("handle");
CREATE UNIQUE INDEX "FanbaseGroup_inviteCode_key" ON "FanbaseGroup"("inviteCode");

ALTER TABLE "Post" ADD COLUMN "channelId" TEXT;
CREATE INDEX "Post_channelId_createdAt_idx" ON "Post"("channelId", "createdAt");

ALTER TABLE "Membership" ADD COLUMN "planId" TEXT;
ALTER TABLE "Membership" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "Membership" ADD COLUMN "autoRenew" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Membership" ADD COLUMN "renewalNotifiedAt" TIMESTAMP(3);
ALTER TABLE "Membership" ADD COLUMN "cardToken" TEXT;
ALTER TABLE "Membership" ADD COLUMN "cardProcessor" TEXT;
ALTER TABLE "Membership" ADD COLUMN "cardEmail" TEXT;

ALTER TABLE "JoinRequest" ADD COLUMN "planId" TEXT;

ALTER TABLE "WalletLedgerEntry" ADD COLUMN "membershipGroupId" TEXT;

ALTER TABLE "Payment" ADD COLUMN "membershipUserId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "membershipGroupId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "membershipPlanId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "membershipAutoRenew" BOOLEAN;

ALTER TABLE "PlatformSettings" ADD COLUMN "commissionMembershipPercent" INTEGER NOT NULL DEFAULT 12;

CREATE TABLE "CommunityChannel" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'DISCUSSION',
    "planIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityChannel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityChannel_groupId_order_idx" ON "CommunityChannel"("groupId", "order");

CREATE TABLE "MembershipPlan" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceKobo" INTEGER NOT NULL DEFAULT 0,
    "cycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MembershipPlan_groupId_idx" ON "MembershipPlan"("groupId");

ALTER TABLE "CommunityChannel" ADD CONSTRAINT "CommunityChannel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FanbaseGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MembershipPlan" ADD CONSTRAINT "MembershipPlan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FanbaseGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "CommunityChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
