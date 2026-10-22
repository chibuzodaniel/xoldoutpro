-- AlterTable
ALTER TABLE "Release" ADD COLUMN     "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "moods" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "Release_genres_idx" ON "Release" USING GIN ("genres");

-- CreateIndex
CREATE INDEX "Release_moods_idx" ON "Release" USING GIN ("moods");
