// Plain money constants with zero imports, so client components (like the
// withdraw and wallet pages) can use them directly without pulling in
// lib/commerce/ledger.ts's server-only Prisma dependency into the browser
// bundle.

// Explicit ask: lowest amount a creator can withdraw in one payout, shown
// on the withdraw page and enforced by POST /api/wallet/withdraw. Not a
// Bachs-imposed limit (their docs don't state one) — a business rule of
// this app's own.
export const MINIMUM_WITHDRAWAL_KOBO = 100_000; // ₦1,000

// DECISIONS.md: 12% commission (was 15% at launch, updated 2026-08-31) on
// music, beats, and merch; ticket sales are 5% (updated 2026-09-02) — event
// tickets carry a lower take since the creator still bears the real-world
// cost of putting the show on. Fee absorbed by the platform (not passed to
// the artist as a separate withdrawal fee). Lives here, not in
// lib/commerce/ledger.ts, specifically so the wallet page (a client
// component) can quote these same numbers in its own copy without
// duplicating a literal that would silently drift from the real rate the
// next time it changes. ledger.ts re-exports both so every existing
// server-side import there keeps working unchanged.
export const COMMISSION_RATE = 0.12;
export const EVENT_COMMISSION_RATE = 0.05;

// Product.type string values, duplicated here rather than imported from the
// generated Prisma client, to keep this file's zero-import contract (see
// the file-level comment above) — a client bundle pulling this in should
// never also pull in Prisma's generated types.
export function commissionRateFor(productType: "RELEASE" | "BEAT" | "EVENT" | "MERCH"): number {
  return productType === "EVENT" ? EVENT_COMMISSION_RATE : COMMISSION_RATE;
}

// Ambassador program (platform-wide referral role, distinct from the
// per-event EventPromoter below). Two tiers only (explicit ask,
// 2026-09-14): every approved ambassador starts at SILVER; GOLD is reached
// by *active* invite count — referred users who've actually made at least
// one purchase, not raw signups — never stored, always derived (see
// getAmbassadorActiveInviteCount in lib/commerce/ledger.ts).
export const AMBASSADOR_GOLD_ACTIVE_INVITES = 500;

export type AmbassadorTier = "SILVER" | "GOLD";

export function ambassadorTierFor(activeInviteCount: number): AmbassadorTier {
  return activeInviteCount >= AMBASSADOR_GOLD_ACTIVE_INVITES ? "GOLD" : "SILVER";
}

// The next tier up from `tier`, or null at the top (GOLD) — used by the
// ambassador dashboard's "X more active invites to reach {next tier}" line.
export function nextAmbassadorTier(tier: AmbassadorTier): AmbassadorTier | null {
  return tier === "SILVER" ? "GOLD" : null;
}

export type AmbassadorTierRateValue = { firstPurchasePercent: number; continuousPercent: number };

// Starting defaults for AmbassadorTierRate rows, lazily upserted on first
// read (see app/api/admin/ambassadors/tier-rates/route.ts) rather than
// seeded via migration data — a moderator can edit these from day one.
// firstPurchasePercent: what the ambassador earns (of the platform's own
// commission) the first time a person they referred ever buys anything.
// continuousPercent: the lower ongoing rate for every purchase that same
// person makes after their first.
export const DEFAULT_AMBASSADOR_TIER_RATES: Record<AmbassadorTier, AmbassadorTierRateValue> = {
  SILVER: { firstPurchasePercent: 20, continuousPercent: 10 },
  GOLD: { firstPurchasePercent: 35, continuousPercent: 20 },
};
