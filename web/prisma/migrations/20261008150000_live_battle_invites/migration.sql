-- CreateEnum
CREATE TYPE "LiveBattleInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "LiveBattleInvite" (
    "id" TEXT NOT NULL,
    "battleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LiveBattleInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "LiveBattleInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveBattleInvite_userId_status_createdAt_idx" ON "LiveBattleInvite"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LiveBattleInvite_battleId_userId_key" ON "LiveBattleInvite"("battleId", "userId");

-- AddForeignKey
ALTER TABLE "LiveBattleInvite" ADD CONSTRAINT "LiveBattleInvite_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "LiveBattle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveBattleInvite" ADD CONSTRAINT "LiveBattleInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
