-- CreateEnum
CREATE TYPE "CollabArrangement" AS ENUM ('ROYALTY_SPLIT', 'CREDIT_ONLY');

-- CreateEnum
CREATE TYPE "CollabStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'ROYALTY_SPLIT_FEE';
ALTER TYPE "LedgerKind" ADD VALUE 'ROYALTY_SPLIT_CREDIT';

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'COLLABORATION';

-- CreateTable
CREATE TABLE "ReleaseCollaborator" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "arrangement" "CollabArrangement" NOT NULL,
    "sharePercent" INTEGER NOT NULL DEFAULT 0,
    "status" "CollabStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ReleaseCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReleaseCollaborator_artistId_status_idx" ON "ReleaseCollaborator"("artistId", "status");

-- CreateIndex
CREATE INDEX "ReleaseCollaborator_productId_status_idx" ON "ReleaseCollaborator"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseCollaborator_productId_artistId_key" ON "ReleaseCollaborator"("productId", "artistId");

-- AddForeignKey
ALTER TABLE "ReleaseCollaborator" ADD CONSTRAINT "ReleaseCollaborator_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCollaborator" ADD CONSTRAINT "ReleaseCollaborator_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseCollaborator" ADD CONSTRAINT "ReleaseCollaborator_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
