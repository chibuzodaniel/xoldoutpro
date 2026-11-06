-- CreateTable
CREATE TABLE "SongComment" (
    "id" TEXT NOT NULL,
    "trackKind" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SongCommentVote" (
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongCommentVote_pkey" PRIMARY KEY ("commentId","userId")
);

-- CreateIndex
CREATE INDEX "SongComment_trackKind_trackId_parentId_createdAt_idx" ON "SongComment"("trackKind", "trackId", "parentId", "createdAt");

-- CreateIndex
CREATE INDEX "SongComment_trackKind_trackId_parentId_likeCount_idx" ON "SongComment"("trackKind", "trackId", "parentId", "likeCount");

-- CreateIndex
CREATE INDEX "SongComment_parentId_createdAt_idx" ON "SongComment"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "SongCommentVote_userId_idx" ON "SongCommentVote"("userId");

-- AddForeignKey
ALTER TABLE "SongComment" ADD CONSTRAINT "SongComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongComment" ADD CONSTRAINT "SongComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SongComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCommentVote" ADD CONSTRAINT "SongCommentVote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "SongComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongCommentVote" ADD CONSTRAINT "SongCommentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

