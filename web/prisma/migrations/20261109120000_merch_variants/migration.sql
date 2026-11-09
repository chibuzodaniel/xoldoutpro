-- AlterTable
ALTER TABLE "MerchItem" ADD COLUMN "sizeGuide" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "variantId" TEXT,
ADD COLUMN "variantLabel" TEXT;

-- CreateTable
CREATE TABLE "MerchVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "cap" INTEGER,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "soldOutAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchVariant_productId_order_idx" ON "MerchVariant"("productId", "order");

-- AddForeignKey
ALTER TABLE "MerchVariant" ADD CONSTRAINT "MerchVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MerchVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
