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
