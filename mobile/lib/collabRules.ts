// Mirrors web/lib/music/collabRules.ts — keep the two in step. Featured artists & revenue sharing: plain rules with zero imports so the
// upload forms (client components) and the API enforce the same numbers.
// See prisma/schema.prisma's ReleaseCollaborator comment for the model.

export const MAX_FEATURED_ARTISTS = 5;

export type CollabArrangement = "ROYALTY_SPLIT" | "CREDIT_ONLY";

export type CollaboratorDraftShare = { arrangement: CollabArrangement; sharePercent: number };

/**
 * The main artist's share is whatever the featured royalty shares leave, so
 * the split always totals exactly 100%. Credit-only tags take no share.
 */
export function mainArtistSharePercent(drafts: CollaboratorDraftShare[]): number {
  return 100 - drafts.reduce((sum, d) => sum + (d.arrangement === "ROYALTY_SPLIT" ? d.sharePercent : 0), 0);
}

/** Null when valid, else a message to show the artist. */
export function collaboratorSharesError(drafts: CollaboratorDraftShare[]): string | null {
  if (drafts.length > MAX_FEATURED_ARTISTS) return `You can tag up to ${MAX_FEATURED_ARTISTS} featured artists`;
  for (const d of drafts) {
    if (d.arrangement !== "ROYALTY_SPLIT") continue;
    if (!Number.isInteger(d.sharePercent) || d.sharePercent < 1 || d.sharePercent > 100) {
      return "Each royalty share must be a whole percentage from 1 to 100";
    }
  }
  if (mainArtistSharePercent(drafts) < 0) return "Royalty shares can't add up to more than 100%";
  return null;
}
