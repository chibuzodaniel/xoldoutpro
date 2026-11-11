-- Event lineup (v2). Additive only.
CREATE TABLE "EventLineupEntry" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventLineupEntry_pkey" PRIMARY KEY ("eventId","userId")
);
CREATE INDEX "EventLineupEntry_userId_idx" ON "EventLineupEntry"("userId");
ALTER TABLE "EventLineupEntry" ADD CONSTRAINT "EventLineupEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventLineupEntry" ADD CONSTRAINT "EventLineupEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
