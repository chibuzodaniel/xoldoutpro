-- CreateEnum
CREATE TYPE "AddOnKind" AS ENUM ('MUSIC_VIDEO', 'VISUALIZER', 'ARTWORK', 'WALLPAPER', 'LYRICS', 'BOOKLET', 'BEHIND_THE_SCENES', 'OTHER');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "addOnCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ProductAddOn" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "AddOnKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "youtubeId" TEXT,
    "fileKey" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAddOn_productId_order_idx" ON "ProductAddOn"("productId", "order");

-- AddForeignKey
ALTER TABLE "ProductAddOn" ADD CONSTRAINT "ProductAddOn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
