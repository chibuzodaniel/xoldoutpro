-- CreateEnum
CREATE TYPE "DownloadKind" AS ENUM ('OFFLINE', 'FILE');

-- CreateTable
CREATE TABLE "ProductDownload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "DownloadKind" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDownload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductDownload_userId_productId_kind_key" ON "ProductDownload"("userId", "productId", "kind");

-- CreateIndex
CREATE INDEX "ProductDownload_productId_idx" ON "ProductDownload"("productId");
