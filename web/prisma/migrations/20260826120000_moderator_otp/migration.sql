-- CreateTable
CREATE TABLE "ModeratorOtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModeratorOtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModeratorOtpCode_userId_expiresAt_idx" ON "ModeratorOtpCode"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "ModeratorOtpCode" ADD CONSTRAINT "ModeratorOtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
