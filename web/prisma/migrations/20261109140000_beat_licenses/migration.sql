-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "licenseId" TEXT,
ADD COLUMN "licenseName" TEXT,
ADD COLUMN "licenseTerms" JSONB;

-- CreateTable
CREATE TABLE "BeatLicense" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "formats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isExclusive" BOOLEAN NOT NULL DEFAULT false,
    "terms" JSONB NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeatLicense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BeatLicense_productId_order_idx" ON "BeatLicense"("productId", "order");

-- AddForeignKey
ALTER TABLE "BeatLicense" ADD CONSTRAINT "BeatLicense_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "BeatLicense"("id") ON DELETE SET NULL ON UPDATE CASCADE;
