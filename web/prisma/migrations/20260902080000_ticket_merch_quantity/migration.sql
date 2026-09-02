-- Drop the one-entitlement-per-user-per-product constraint so a ticket/merch
-- group buy can create one Entitlement row per unit for the same user+product.
DROP INDEX "Entitlement_userId_productId_key";
CREATE INDEX "Entitlement_userId_productId_idx" ON "Entitlement"("userId", "productId");

-- Per-OrderItem quantity for a group buy; defaults to 1 so every existing row
-- (always a single unit until now) stays correct.
ALTER TABLE "OrderItem" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
