import { db } from "@/lib/db";

export type WeeklyTopCreator = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  metric: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Ranks creators by confirmed, non-refunded entitlements sold across all
// their products (not just releases) in the last 7 days. Entitlement has no
// creatorId of its own (only productId), so this aggregates in JS rather
// than a single groupBy — fine at this scale. Falls back to most-followed
// creators when nothing has sold yet (e.g. right after launch), so callers
// always get a non-empty list.
export async function getWeeklyTopCreators(limit: number): Promise<WeeklyTopCreator[]> {
  const oneWeekAgo = new Date(Date.now() - WEEK_MS);

  const weeklySales = await db.entitlement.findMany({
    where: { createdAt: { gte: oneWeekAgo }, revokedAt: null },
    select: { product: { select: { creatorId: true } } },
  });

  const salesByCreatorId = new Map<string, number>();
  for (const e of weeklySales) {
    salesByCreatorId.set(e.product.creatorId, (salesByCreatorId.get(e.product.creatorId) ?? 0) + 1);
  }
  const topCreatorIds = [...salesByCreatorId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topCreatorIds.length === 0) {
    const creators = await db.user.findMany({
      orderBy: { followers: { _count: "desc" } },
      take: limit,
      select: { id: true, handle: true, displayName: true, avatarUrl: true, _count: { select: { followers: true } } },
    });
    return creators.map((c) => ({ ...c, metric: `${c._count.followers} followers` }));
  }

  const found = await db.user.findMany({
    where: { id: { in: topCreatorIds } },
    select: { id: true, handle: true, displayName: true, avatarUrl: true },
  });
  // findMany's `in` doesn't preserve order, so re-sort to rank order.
  return topCreatorIds
    .map((id) => {
      const c = found.find((c) => c.id === id);
      if (!c) return null;
      return { ...c, metric: `${salesByCreatorId.get(id) ?? 0} sold` };
    })
    .filter((c): c is WeeklyTopCreator => c !== null);
}
