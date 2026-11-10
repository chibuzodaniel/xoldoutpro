-- Communities part 3: community reports and moderator suspension. Additive only.
ALTER TYPE "ReportTargetType" ADD VALUE 'COMMUNITY';
ALTER TYPE "ReportReason" ADD VALUE 'SPAM_OR_SCAM';
ALTER TYPE "ReportReason" ADD VALUE 'FRAUDULENT_PAYMENTS';
ALTER TYPE "ReportReason" ADD VALUE 'ABUSE_OR_HARASSMENT';
ALTER TYPE "ReportReason" ADD VALUE 'ILLEGAL_CONTENT';
ALTER TYPE "ReportReason" ADD VALUE 'OTHER';
ALTER TABLE "FanbaseGroup" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "Report" ADD COLUMN "groupId" TEXT;
ALTER TABLE "Report" ADD CONSTRAINT "Report_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FanbaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
