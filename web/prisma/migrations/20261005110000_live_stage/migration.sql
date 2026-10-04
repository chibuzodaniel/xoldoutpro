-- Live co-hosting: host-appointed moderators and the queue of viewers
-- asking to come on stage. Who is actually on stage lives in LiveKit.
CREATE TYPE "LiveStageRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

CREATE TABLE "LiveModerator" (
    "liveSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveModerator_pkey" PRIMARY KEY ("liveSessionId","userId")
);

CREATE TABLE "LiveStageRequest" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LiveStageRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveStageRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveStageRequest_liveSessionId_userId_key" ON "LiveStageRequest"("liveSessionId", "userId");
CREATE INDEX "LiveStageRequest_liveSessionId_status_idx" ON "LiveStageRequest"("liveSessionId", "status");

ALTER TABLE "LiveModerator" ADD CONSTRAINT "LiveModerator_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LiveModerator" ADD CONSTRAINT "LiveModerator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LiveStageRequest" ADD CONSTRAINT "LiveStageRequest_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LiveStageRequest" ADD CONSTRAINT "LiveStageRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
