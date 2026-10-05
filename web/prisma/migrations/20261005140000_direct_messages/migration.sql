-- CreateEnum
CREATE TYPE "ConversationParticipantStatus" AS ENUM ('ACTIVE', 'REQUEST');

-- CreateEnum
CREATE TYPE "DirectMessageKind" AS ENUM ('TEXT', 'IMAGE', 'SHARE', 'SYSTEM');

-- AlterEnum
ALTER TYPE "ReportTargetType" ADD VALUE 'CONVERSATION';

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "conversationId" TEXT;

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disappearSeconds" INTEGER,
    "pendingDisappearSeconds" INTEGER,
    "pendingDisappearById" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ConversationParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastReadAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "kind" "DirectMessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "imageUrl" TEXT,
    "shareType" TEXT,
    "shareId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_pairKey_key" ON "Conversation"("pairKey");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");

-- CreateIndex
CREATE INDEX "DirectMessage_conversationId_createdAt_idx" ON "DirectMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectMessage_expiresAt_idx" ON "DirectMessage"("expiresAt");

-- CreateIndex
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

