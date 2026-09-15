-- AlterTable
ALTER TABLE "TrackPlay" ADD COLUMN     "productId" TEXT;

-- CreateIndex
CREATE INDEX "TrackPlay_userId_productId_idx" ON "TrackPlay"("userId", "productId");
