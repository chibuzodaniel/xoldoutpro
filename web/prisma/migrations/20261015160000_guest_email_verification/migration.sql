-- CreateTable
CREATE TABLE "GuestEmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "token" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestEmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuestEmailVerification_token_key" ON "GuestEmailVerification"("token");

-- CreateIndex
CREATE INDEX "GuestEmailVerification_email_createdAt_idx" ON "GuestEmailVerification"("email", "createdAt");

-- CreateIndex
CREATE INDEX "GuestEmailVerification_ip_createdAt_idx" ON "GuestEmailVerification"("ip", "createdAt");
