-- AlterTable
ALTER TABLE "Order" ADD COLUMN "tipRecipientId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tipRecipientId_fkey" FOREIGN KEY ("tipRecipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
