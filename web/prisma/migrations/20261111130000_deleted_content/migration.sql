-- Deleted content archive (admin-only). Additive only.
CREATE TABLE "DeletedContent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "ownerId" TEXT,
    "deletedById" TEXT,
    "deletedByRole" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "preview" TEXT,
    "snapshot" JSONB NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    CONSTRAINT "DeletedContent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeletedContent_deletedAt_idx" ON "DeletedContent"("deletedAt");
CREATE INDEX "DeletedContent_kind_deletedAt_idx" ON "DeletedContent"("kind", "deletedAt");
CREATE INDEX "DeletedContent_targetId_idx" ON "DeletedContent"("targetId");
