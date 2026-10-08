-- CreateEnum
CREATE TYPE "LiveBattleStatus" AS ENUM ('READY', 'IN_PROGRESS', 'VOTING', 'FINISHED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "LedgerKind" ADD VALUE 'XG_PURCHASE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CoinLedgerKind" ADD VALUE 'BATTLE_PRIZE_HOLD';
ALTER TYPE "CoinLedgerKind" ADD VALUE 'BATTLE_PRIZE_REFUND';

-- AlterEnum
ALTER TYPE "XgEarningSource" ADD VALUE 'BATTLE_PRIZE';

-- AlterTable
ALTER TABLE "LiveGift" ADD COLUMN     "battleId" TEXT,
ADD COLUMN     "recipientId" TEXT;

-- CreateTable
CREATE TABLE "LiveBattle" (
    "id" TEXT NOT NULL,
    "liveSessionId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LiveBattleStatus" NOT NULL DEFAULT 'READY',
    "rounds" INTEGER NOT NULL,
    "turnSeconds" INTEGER NOT NULL,
    "votingSeconds" INTEGER NOT NULL,
    "prizePlaces" INTEGER[],
    "prizeXg" INTEGER NOT NULL,
    "currentTurnId" TEXT,
    "votingEndsAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveBattle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveBattleCompetitor" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "giftsXg" INTEGER NOT NULL DEFAULT 0,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "place" INTEGER,
    "prizeXg" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LiveBattleCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveBattleTurn" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LiveBattleTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveBattleVote" (
    "battleId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveBattleVote_pkey" PRIMARY KEY ("battleId","voterId")
);

-- CreateIndex
CREATE INDEX "LiveBattle_liveSessionId_idx" ON "LiveBattle"("liveSessionId");

-- CreateIndex
CREATE INDEX "LiveBattle_status_finishedAt_idx" ON "LiveBattle"("status", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveBattleCompetitor_battleId_userId_key" ON "LiveBattleCompetitor"("battleId", "userId");

-- CreateIndex
CREATE INDEX "LiveBattleTurn_battleId_round_idx" ON "LiveBattleTurn"("battleId", "round");

-- AddForeignKey
ALTER TABLE "LiveGift" ADD CONSTRAINT "LiveGift_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveGift" ADD CONSTRAINT "LiveGift_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "LiveBattle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattle" ADD CONSTRAINT "LiveBattle_liveSessionId_fkey" FOREIGN KEY ("liveSessionId") REFERENCES "LiveSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattle" ADD CONSTRAINT "LiveBattle_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleCompetitor" ADD CONSTRAINT "LiveBattleCompetitor_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "LiveBattle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleCompetitor" ADD CONSTRAINT "LiveBattleCompetitor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleTurn" ADD CONSTRAINT "LiveBattleTurn_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "LiveBattle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleTurn" ADD CONSTRAINT "LiveBattleTurn_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "LiveBattleCompetitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleVote" ADD CONSTRAINT "LiveBattleVote_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "LiveBattle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleVote" ADD CONSTRAINT "LiveBattleVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleVote" ADD CONSTRAINT "LiveBattleVote_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "LiveBattleCompetitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

