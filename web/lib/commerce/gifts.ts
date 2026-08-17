// PRD §18 open decision (gift claim mechanics) — defaulted here, not
// resolved in the PRD itself: claim by shareable link (works over WhatsApp,
// no recipient identity needed up front), 7-day claim window matching the
// existing settlement/refund window length for consistency, unclaimed gifts
// return the unit and refund the giver rather than being silently dropped.
export const GIFT_EXPIRY_DAYS = 7;

// Gifting is scoped to RELEASE/BEAT/EVENT — not MERCH. A claim link has no
// recipient identity attached until someone claims it, so there's no
// shipping address to gift a physical item to.
export const GIFTABLE_TYPES = ["RELEASE", "BEAT", "EVENT"] as const;

export function giftExpiresAt() {
  return new Date(Date.now() + GIFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}
