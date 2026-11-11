-- Remove from library (buyer-side hide). Additive only.
ALTER TABLE "Entitlement" ADD COLUMN "hiddenAt" TIMESTAMP(3);
