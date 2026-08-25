-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('IDENTITY', 'SELLER', 'CREATOR', 'OFFICIAL', 'BUSINESS', 'FANBASE');

-- CreateEnum
CREATE TYPE "VerificationBadgeType" AS ENUM ('IDENTITY_VERIFIED', 'SELLER_VERIFIED', 'CREATOR_VERIFIED', 'OFFICIAL_ACCOUNT', 'TRUSTED_BUSINESS', 'OFFICIAL_FANBASE', 'RECOGNIZED_COMMUNITY');

-- CreateEnum
CREATE TYPE "VerificationApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'APPROVED', 'REJECTED', 'SUSPENDED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationDocumentType" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE', 'PROOF_OF_ADDRESS', 'BUSINESS_REGISTRATION', 'SUPPORTING_EVIDENCE');

-- CreateEnum
CREATE TYPE "VerificationDocumentStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationAuditAction" AS ENUM ('APPLICATION_CREATED', 'DOCUMENT_UPLOADED', 'APPLICATION_SUBMITTED', 'MOVED_UNDER_REVIEW', 'INFO_REQUESTED', 'APPLICATION_APPROVED', 'APPLICATION_REJECTED', 'VERIFICATION_SUSPENDED', 'VERIFICATION_REVOKED', 'VERIFICATION_EXPIRED');

-- AlterTable
ALTER TABLE "FanbaseGroup" ADD COLUMN     "verificationBadgeType" "VerificationBadgeType";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "salesMilestoneNotifiedAt" TIMESTAMP(3),
ADD COLUMN     "verificationBadges" "VerificationBadgeType"[] DEFAULT ARRAY[]::"VerificationBadgeType"[];

-- CreateTable
CREATE TABLE "VerificationApplication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "status" "VerificationApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "groupId" TEXT,
    "legalFirstName" TEXT,
    "legalLastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "country" TEXT,
    "region" TEXT,
    "phone" TEXT,
    "photoUrl" TEXT,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "documentExpiresAt" TIMESTAMP(3),
    "categoryData" JSONB,
    "eligibilitySnapshot" JSONB,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "additionalInfoRequest" TEXT,
    "internalNotes" TEXT,
    "grantedBadgeType" "VerificationBadgeType",
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspendedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "documentType" "VerificationDocumentType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "VerificationDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationAuditLog" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "VerificationAuditAction" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationApplication_userId_status_idx" ON "VerificationApplication"("userId", "status");

-- CreateIndex
CREATE INDEX "VerificationApplication_status_type_idx" ON "VerificationApplication"("status", "type");

-- CreateIndex
CREATE INDEX "VerificationApplication_groupId_idx" ON "VerificationApplication"("groupId");

-- CreateIndex
CREATE INDEX "VerificationDocument_applicationId_idx" ON "VerificationDocument"("applicationId");

-- CreateIndex
CREATE INDEX "VerificationAuditLog_applicationId_createdAt_idx" ON "VerificationAuditLog"("applicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "VerificationApplication" ADD CONSTRAINT "VerificationApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationApplication" ADD CONSTRAINT "VerificationApplication_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "FanbaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationApplication" ADD CONSTRAINT "VerificationApplication_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationDocument" ADD CONSTRAINT "VerificationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VerificationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAuditLog" ADD CONSTRAINT "VerificationAuditLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VerificationApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAuditLog" ADD CONSTRAINT "VerificationAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
