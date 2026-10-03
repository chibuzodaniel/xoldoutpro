-- Scheduled Lives: created ahead of time with a shareable link; the LiveKit
-- room only exists once the host starts it.
ALTER TYPE "LiveSessionStatus" ADD VALUE 'SCHEDULED' BEFORE 'LIVE';
ALTER TABLE "LiveSession" ALTER COLUMN "roomName" DROP NOT NULL;
ALTER TABLE "LiveSession" ADD COLUMN "scheduledFor" TIMESTAMP(3);

-- "Remind me" on a scheduled Live.
CREATE TABLE "LiveReminder" (
    "liveSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveReminder_pkey" PRIMARY KEY ("liveSessionId","userId")
);
CREATE INDEX "LiveReminder_userId_idx" ON "LiveReminder"("userId");
ALTER TABLE "LiveReminder" ADD CONSTRAINT "LiveReminder_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveReminder" ADD CONSTRAINT "LiveReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
