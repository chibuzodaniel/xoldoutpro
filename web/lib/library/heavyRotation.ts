import { db } from "@/lib/db";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";

const RECENCY_WINDOW_DAYS = 60;

// "Heavy Rotation": a fan's own most-played owned tracks/beats, ranked by
// play count in the last 60 days. Only ever built from TrackPlay rows that
// carry a productId — set only for entitled (owned) plays, never previews
// (see the audio-url routes' own comments on that field).
export async function getHeavyRotation(userId: string, limit: number) {
  const since = new Date(Date.now() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const grouped = await db.trackPlay.groupBy({
    by: ["productId"],
    where: { userId, productId: { not: null }, createdAt: { gte: since } },
    _count: { productId: true },
    orderBy: { _count: { productId: "desc" } },
    take: limit,
  });

  const productIds = grouped.map((g) => g.productId).filter((id): id is string => id !== null);
  if (productIds.length === 0) return [];

  const products = await db.product.findMany({
    where: { id: { in: productIds }, status: { not: "DELETED" } },
    include: discoverCardInclude,
  });

  // groupBy doesn't preserve order, and a since-deleted product must be
  // dropped rather than surfaced with missing data.
  return productIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);
}
