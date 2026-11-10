-- Socials v2: audience, reposts, attachments. Additive only.
ALTER TABLE "Post" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'EVERYONE';
ALTER TABLE "Post" ADD COLUMN "repostOfId" TEXT;
ALTER TABLE "Post" ADD COLUMN "attachedProductId" TEXT;
ALTER TABLE "Post" ADD COLUMN "attachedEventId" TEXT;
CREATE UNIQUE INDEX "Post_authorId_repostOfId_key" ON "Post"("authorId", "repostOfId");
CREATE INDEX "Post_repostOfId_idx" ON "Post"("repostOfId");
ALTER TABLE "Post" ADD CONSTRAINT "Post_repostOfId_fkey" FOREIGN KEY ("repostOfId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_attachedProductId_fkey" FOREIGN KEY ("attachedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_attachedEventId_fkey" FOREIGN KEY ("attachedEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
