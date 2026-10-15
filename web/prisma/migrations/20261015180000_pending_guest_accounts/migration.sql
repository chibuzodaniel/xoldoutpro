-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pendingGuestAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "guestAccessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_guestAccessToken_key" ON "Order"("guestAccessToken");
