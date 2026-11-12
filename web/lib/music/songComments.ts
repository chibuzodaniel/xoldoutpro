import { db } from "@/lib/db";

// Shared bits for the player's YouTube-style song comments
// (app/api/song-comments/*, prisma model SongComment).

export const SONG_COMMENT_PAGE = 20;
export const SONG_COMMENT_MAX_LENGTH = 1000;

// "product" (v2 feed comments, 2026-11-09): comments on a merch item or
// event as a whole — trackId is then the Product id. Stored in the same
// table (trackKind is a plain string), so no migration.
export type SongKind = "track" | "beat" | "product";
export const SONG_KINDS = ["track", "beat", "product"] as const;

export const songCommentSelect = {
  id: true,
  body: true,
  createdAt: true,
  likeCount: true,
  replyCount: true,
  parentId: true,
  author: { select: { id: true, handle: true, displayName: true, avatarUrl: true, countryCode: true } },
} as const;

/**
 * The song a comment hangs off: the owning Product and its creator, or null
 * when the track/beat doesn't exist or isn't published. One indexed lookup.
 */
export async function resolveSong(kind: SongKind, trackId: string) {
  if (kind === "product") {
    const p = await db.product.findUnique({ where: { id: trackId }, select: { id: true, creatorId: true, status: true, type: true } });
    return p && p.status === "PUBLISHED" && (p.type === "MERCH" || p.type === "EVENT")
      ? { productId: p.id, creatorId: p.creatorId, productType: p.type as string }
      : null;
  }
  if (kind === "beat") {
    const beat = await db.beat.findUnique({
      where: { productId: trackId },
      select: { product: { select: { id: true, creatorId: true, status: true } } },
    });
    const p = beat?.product;
    return p && p.status === "PUBLISHED" ? { productId: p.id, creatorId: p.creatorId } : null;
  }
  const track = await db.track.findUnique({
    where: { id: trackId },
    select: { release: { select: { product: { select: { id: true, creatorId: true, status: true } } } } },
  });
  const p = track?.release.product;
  return p && p.status === "PUBLISHED" ? { productId: p.id, creatorId: p.creatorId } : null;
}

/** The viewer's own like/dislike on each of these comments (1 / -1; absent = none). */
export async function viewerVotes(userId: string | undefined, commentIds: string[]) {
  if (!userId || commentIds.length === 0) return new Map<string, number>();
  const votes = await db.songCommentVote.findMany({
    where: { userId, commentId: { in: commentIds } },
    select: { commentId: true, value: true },
  });
  return new Map(votes.map((v) => [v.commentId, v.value]));
}

export function songUrl(kind: SongKind, productId: string, productType?: string) {
  if (kind === "product") return productType === "EVENT" ? `/e/${productId}` : `/m/${productId}`;
  return kind === "beat" ? `/b/${productId}` : `/r/${productId}`;
}
