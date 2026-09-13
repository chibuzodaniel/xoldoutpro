import { db } from "@/lib/db";
import { getWeeklyTopCreators, type WeeklyTopCreator } from "@/lib/discover/weeklyTopCreators";

export const discoverCardInclude = {
  creator: { select: { handle: true, displayName: true } },
  release: { select: { artworkLadder: true, releaseType: true } },
  beat: { select: { coverImageLadder: true } },
  merchItem: { select: { imageLadder: true } },
  stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
} as const;

// Single source of truth for the "all" (untyped) view of Discover — shared
// by the web page and the /api/discover route so web and mobile render the
// exact same picks (hero, weekly ranking, etc.) without duplicating the
// underlying queries.
export async function getDiscoverData() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [newReleases, weeklyTopSellers, weeklyTopCreators, topBeats, upcomingEvents, merchItems, creators] =
    await Promise.all([
      db.product.findMany({
        where: { type: "RELEASE", status: "PUBLISHED" },
        include: discoverCardInclude,
        orderBy: { publishedAt: "desc" },
        take: 12,
      }),
      // "Sales for the week" = confirmed, non-refunded entitlements (one row
      // per unit sold — see Entitlement's own comment) created in the last 7
      // days, grouped by product. Falls back to the newest release below when
      // nothing has sold yet in that window (e.g. right after launch).
      db.entitlement.groupBy({
        by: ["productId"],
        where: { createdAt: { gte: oneWeekAgo }, revokedAt: null, product: { type: "RELEASE", status: "PUBLISHED" } },
        _count: { productId: true },
        orderBy: { _count: { productId: "desc" } },
        take: 1,
      }),
      // Fetches 10 so a "View all" list can show more than the 3 a compact
      // rail displays.
      getWeeklyTopCreators(10),
      db.product.findMany({
        where: { type: "BEAT", status: "PUBLISHED" },
        include: discoverCardInclude,
        orderBy: { publishedAt: "desc" },
        take: 6,
      }),
      db.event.findMany({
        where: { status: "PUBLISHED", startsAt: { gte: new Date() } },
        include: { tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } } },
        orderBy: { startsAt: "asc" },
        take: 6,
      }),
      db.product.findMany({
        where: { type: "MERCH", status: "PUBLISHED" },
        include: discoverCardInclude,
        orderBy: { publishedAt: "desc" },
        take: 6,
      }),
      db.user.findMany({
        orderBy: { followers: { _count: "desc" } },
        take: 10,
        select: { id: true, handle: true, displayName: true, avatarUrl: true, _count: { select: { followers: true } } },
      }),
    ]);

  const weeklyTopSellerId = weeklyTopSellers[0]?.productId;
  const hero =
    (weeklyTopSellerId ? newReleases.find((p) => p.id === weeklyTopSellerId) : null) ??
    (weeklyTopSellerId
      ? await db.product.findUnique({ where: { id: weeklyTopSellerId }, include: discoverCardInclude })
      : null) ??
    newReleases[0] ??
    null;
  // Only true when `hero` actually won on weekly sales (as opposed to the
  // newest-release fallback used when nothing's sold yet) — stockPolicy's
  // "sold" count is lifetime, so it can't be reused for this.
  const heroWeeklySold = hero?.id === weeklyTopSellerId ? (weeklyTopSellers[0]?._count.productId ?? 0) : 0;
  const newReleasesBelowHero = newReleases.filter((p) => p.id !== hero?.id);

  return {
    hero,
    heroWeeklySold,
    newReleasesBelowHero,
    recommended: newReleases,
    weeklyTopCreators,
    topBeats,
    upcomingEvents,
    merchItems,
    creators,
  };
}

export type WeeklyTopCreatorDTO = WeeklyTopCreator;
