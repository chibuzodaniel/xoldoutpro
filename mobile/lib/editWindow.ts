// Mirrors web's lib/editWindow.ts exactly — a creator can edit a listing
// (title/description/price/cap-lowering, never artwork/audio/tracks) only
// within a fixed window after it first went live. Shared number, not
// independently invented, so the two clients can never drift on when the
// Edit affordance should disappear (the server enforces it regardless).
export const EDIT_WINDOW_HOURS = 48;

export function isWithinEditWindow(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() < EDIT_WINDOW_HOURS * 60 * 60 * 1000;
}
