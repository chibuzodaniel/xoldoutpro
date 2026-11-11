-- One-time upgrade edit for older listings. Additive only.
ALTER TABLE "Product" ADD COLUMN "upgradeEditAt" TIMESTAMP(3);
