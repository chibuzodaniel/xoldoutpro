-- Explicit ask, 2026-09-15: firstPurchasePercent/continuousPercent are now a
-- whole percent OF GROSS (not of the platform's commission), clamped to the
-- commission actually collected on that sale (see recordAmbassadorCommission
-- in lib/commerce/ledger.ts). A referred person's FIRST purchase pays the
-- ambassador the platform's ENTIRE commission (platform keeps 0) for both
-- tiers — firstPurchasePercent=12 matches today's 12% RELEASE/BEAT/MERCH
-- rate exactly, and the clamp still caps it at the real (lower) commission
-- on a 5%-commission EVENT sale, so the ambassador never gets more than the
-- whole commission either way. After that first purchase, Silver keeps
-- nothing further (continuousPercent=0) while Gold keeps 2% of the sale
-- (continuousPercent=2) — e.g. on a 12%-commission sale, Gold keeps 2 and
-- the platform keeps the remaining 10.
--
-- getAmbassadorTierRates() prefers an existing AmbassadorTierRate row over
-- lib/commerce/constants.ts's DEFAULT_AMBASSADOR_TIER_RATES, so a data-only
-- schema change isn't enough here — any row a moderator already saved via
-- the tier-rate editor would otherwise silently keep paying out the old
-- split. Upsert both tier rows directly so the new business rule takes
-- effect immediately, while still leaving them fully moderator-editable
-- afterward via the existing PATCH /api/admin/ambassadors/tier-rates
-- endpoint.
INSERT INTO "AmbassadorTierRate" ("tier", "firstPurchasePercent", "continuousPercent", "updatedAt")
VALUES
  ('SILVER', 12, 0, CURRENT_TIMESTAMP),
  ('GOLD', 12, 2, CURRENT_TIMESTAMP)
ON CONFLICT ("tier") DO UPDATE SET
  "firstPurchasePercent" = EXCLUDED."firstPurchasePercent",
  "continuousPercent" = EXCLUDED."continuousPercent",
  "updatedAt" = CURRENT_TIMESTAMP;
