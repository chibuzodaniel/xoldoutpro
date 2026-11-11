// A creator can edit a listing (title/description/price/cap-lowering, and —
// since 2026-11-04, explicit ask — a release's cover; never audio/tracks,
// those stay a re-publish since buyers may already own what was there) only within a fixed window after
// it first went live. Explicit ask, not a PRD number. Shared between server
// (route-level enforcement) and client (hiding the Edit affordance once it's
// moot) so the two can never drift.
export const EDIT_WINDOW_HOURS = 48;

export function isWithinEditWindow(publishedAt: Date | string | null): boolean {
  if (!publishedAt) return false;
  const publishedMs = typeof publishedAt === "string" ? new Date(publishedAt).getTime() : publishedAt.getTime();
  return Date.now() - publishedMs < EDIT_WINDOW_HOURS * 60 * 60 * 1000;
}

// One-time upgrade edit (explicit ask, 2026-11-11): listings published before
// this date get one more chance to change name, price, cover and description
// after their window closed. The first such save stamps Product.upgradeEditAt
// and opens a fresh window of the same length; then it locks for good. Newer
// listings keep the normal window only.
export const UPGRADE_EDIT_CUTOFF = new Date("2026-11-12T00:00:00Z");

export type ListingEditState = "open" | "upgrade" | "closed";

export function listingEditState(publishedAt: Date | string | null, upgradeEditAt: Date | string | null): ListingEditState {
  if (isWithinEditWindow(publishedAt)) return "open";
  if (!publishedAt) return "closed";
  const published = typeof publishedAt === "string" ? new Date(publishedAt) : publishedAt;
  if (published >= UPGRADE_EDIT_CUTOFF) return "closed";
  if (!upgradeEditAt) return "upgrade";
  return isWithinEditWindow(upgradeEditAt) ? "open" : "closed";
}
