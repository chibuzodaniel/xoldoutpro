-- CreateTable
CREATE TABLE "LiveGuestAlert" (
    "liveSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveGuestAlert_pkey" PRIMARY KEY ("liveSessionId","userId")
);

-- AddForeignKey
ALTER TABLE "LiveGuestAlert" ADD CONSTRAINT "LiveGuestAlert_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGuestAlert" ADD CONSTRAINT "LiveGuestAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
