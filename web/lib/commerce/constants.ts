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
// per-event EventPromoter below): tiers are never stored, only ever derived
// from how much platform-commission revenue an ambassador's referred users
// have generated in total — see ambassadorTierFor(). Starting thresholds,
// trivially tunable later since they're just constants.
export const AMBASSADOR_TIER_THRESHOLDS_KOBO = {
  BRONZE: 0, // every approved ambassador's starting floor
  SILVER: 5_000_000, // ₦50,000
  GOLD: 20_000_000, // ₦200,000
  PLATINUM: 50_000_000, // ₦500,000
} as const;

export type AmbassadorTier = "BRONZE" | "SILVER" | "GOLD" | "PLATINUM";

export function ambassadorTierFor(revenueGeneratedKobo: number): AmbassadorTier {
  if (revenueGeneratedKobo >= AMBASSADOR_TIER_THRESHOLDS_KOBO.PLATINUM) return "PLATINUM";
  if (revenueGeneratedKobo >= AMBASSADOR_TIER_THRESHOLDS_KOBO.GOLD) return "GOLD";
  if (revenueGeneratedKobo >= AMBASSADOR_TIER_THRESHOLDS_KOBO.SILVER) return "SILVER";
  return "BRONZE";
}

// The next tier up from `tier`, or null at the top (PLATINUM) — used by the
// ambassador dashboard's "₦X more to reach {next tier}" motivational line.
export function nextAmbassadorTier(tier: AmbassadorTier): AmbassadorTier | null {
  if (tier === "BRONZE") return "SILVER";
  if (tier === "SILVER") return "GOLD";
  if (tier === "GOLD") return "PLATINUM";
  return null;
}

// Starting defaults for AmbassadorTierRate rows, lazily upserted on first
// read (see app/api/admin/ambassadors/tier-rates/route.ts) rather than
// seeded via migration data — a moderator can edit these from day one.
export const DEFAULT_AMBASSADOR_TIER_RATES: Record<AmbassadorTier, number> = {
  BRONZE: 10,
  SILVER: 20,
  GOLD: 30,
  PLATINUM: 50,
};
