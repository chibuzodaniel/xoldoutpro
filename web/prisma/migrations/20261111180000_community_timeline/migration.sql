-- Community Timeline: post kinds, approval, pinning, media; poll kind/closing;
-- member posting mode. Additive only.
ALTER TABLE "Post" ADD COLUMN "kind" TEXT;
ALTER TABLE "Post" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "Post" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "media" JSONB;
ALTER TABLE "Post" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "reviewedById" TEXT;
CREATE INDEX "Post_groupId_status_createdAt_idx" ON "Post"("groupId", "status", "createdAt");

ALTER TABLE "Poll" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'POLL';
ALTER TABLE "Poll" ADD COLUMN "closesAt" TIMESTAMP(3);

ALTER TABLE "FanbaseGroup" ADD COLUMN "postingMode" TEXT;
