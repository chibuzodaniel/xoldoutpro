-- AlterTable
ALTER TABLE "Order" ADD COLUMN "checkoutGroupId" TEXT,
ADD COLUMN "amountKobo" INTEGER;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "checkoutGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Order_checkoutGroupId_idx" ON "Order"("checkoutGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_checkoutGroupId_key" ON "Payment"("checkoutGroupId");
