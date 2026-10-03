-- Billboards: optional promoted item (product or event) + impression count.
ALTER TABLE "Billboard" ADD COLUMN "productId" TEXT;
ALTER TABLE "Billboard" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Billboard" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Billboard" ADD CONSTRAINT "Billboard_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Billboard" ADD CONSTRAINT "Billboard_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
