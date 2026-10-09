-- AlterTable
ALTER TABLE "LiveBattleCompetitor" ADD COLUMN     "turnVotes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LiveBattleTurnVote" (
    "turnId" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveBattleTurnVote_pkey" PRIMARY KEY ("turnId","voterId")
);

-- CreateIndex
CREATE INDEX "LiveBattleTurnVote_battleId_idx" ON "LiveBattleTurnVote"("battleId");

-- AddForeignKey
ALTER TABLE "LiveBattleTurnVote" ADD CONSTRAINT "LiveBattleTurnVote_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "LiveBattleTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleTurnVote" ADD CONSTRAINT "LiveBattleTurnVote_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "LiveBattle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleTurnVote" ADD CONSTRAINT "LiveBattleTurnVote_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "LiveBattleCompetitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleTurnVote" ADD CONSTRAINT "LiveBattleTurnVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

