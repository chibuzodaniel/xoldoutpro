import { db } from "@/lib/db";

export type WeeklyTopCreator = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  metric: string;
};

// Ranks creators by confirmed, non-refunded entitlements sold across all
// their products (not just releases), restricted to the last 14 days
// (explicit ask, 2026-09-14: "latest sales at least a week or two" — a
// reversal of this file's earlier all-time behavior, which itself had
// reversed an original 7-day window; two weeks splits the difference).
// Entitlement has no creatorId of its own (only productId), so this
// aggregates in JS rather than a single groupBy — fine at this scale.
// A newer platform (or a quiet fortnight) can still have fewer than `limit`
// distinct sellers in that window, which used to leave the Discover rail
// looking sparse/empty next to New Release — so once real recent sellers
// are exhausted, the rest of `limit` is padded with the next most-followed
// creators (excluding anyone already listed), so callers reliably get a
// full list to fill the space. Padded entries show a follower count instead
// of a sold count, since they honestly haven't sold anything recently.
const RECENCY_WINDOW_DAYS = 14;

export async function getWeeklyTopCreators(limit: number): Promise<WeeklyTopCreator[]> {
  const since = new Date(Date.now() - RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const allSales = await db.entitlement.findMany({
    where: { revokedAt: null, createdAt: { gte: since } },
    select: { product: { select: { creatorId: true } } },
  });

  const salesByCreatorId = new Map<string, number>();
  for (const e of allSales) {
    salesByCreatorId.set(e.product.creatorId, (salesByCreatorId.get(e.product.creatorId) ?? 0) + 1);
  }
  const topCreatorIds = [...salesByCreatorId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const sellers =
    topCreatorIds.length > 0
      ? await db.user
          .findMany({
            where: { id: { in: topCreatorIds } },
            select: { id: true, handle: true, displayName: true, avatarUrl: true },
          })
          // findMany's `in` doesn't preserve order, so re-sort to rank order.
          .then((found) =>
            topCreatorIds
              .map((id) => {
                const c = found.find((c) => c.id === id);
                if (!c) return null;
                return { ...c, metric: `${salesByCreatorId.get(id) ?? 0} sold` };
              })
              .filter((c): c is WeeklyTopCreator => c !== null),
          )
      : [];

  const remaining = limit - sellers.length;
  if (remaining <= 0) return sellers;

  const padding = await db.user.findMany({
    where: { id: { notIn: topCreatorIds } },
    orderBy: { followers: { _count: "desc" } },
    take: remaining,
    select: { id: true, handle: true, displayName: true, avatarUrl: true, _count: { select: { followers: true } } },
  });

  return [...sellers, ...padding.map((c) => ({ ...c, metric: `${c._count.followers} followers` }))];
}
