import { db } from "@/lib/db";
import { getWeeklyTopCreators, type WeeklyTopCreator } from "@/lib/discover/weeklyTopCreators";

export const discoverCardInclude = {
  creator: { select: { handle: true, displayName: true, countryCode: true } },
  release: { select: { artworkLadder: true, releaseType: true } },
  beat: { select: { coverImageLadder: true } },
  merchItem: { select: { imageLadder: true } },
  stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
} as const;

// Single source of truth for the "all" (untyped) view of Discover — shared
// by the web page and the /api/discover route so web and mobile render the
// exact same picks (hero, weekly ranking, etc.) without duplicating the
// underlying queries.
const HERO_SLIDES = 3;

export async function getDiscoverData() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const [newReleases, weeklyTopSellers, weeklyTopCreators, topBeats, upcomingEvents, merchItems, creators, allTimeTopSellers] =
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
        take: HERO_SLIDES,
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
        where: { pendingGuestAt: null },
        orderBy: { followers: { _count: "desc" } },
        take: 10,
        select: { id: true, handle: true, displayName: true, avatarUrl: true, _count: { select: { followers: true } } },
      }),
      // All-time best sellers (paid, non-refunded order lines) — tops the
      // hero billboard up to 3 slides when fewer than 3 releases sold this week.
      db.orderItem.groupBy({
        by: ["productId"],
        where: { priceKobo: { gt: 0 }, order: { status: "PAID" }, product: { type: "RELEASE", status: "PUBLISHED" } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: HERO_SLIDES * 2,
      }),
    ]);

  // Hero billboard (explicit ask, 2026-11-04): the top 3 sellers, auto-
  // swiping. This week's best sellers come first; if fewer than 3 sold this
  // week, all-time best sellers fill the rest (weeklySold 0, totalSold set).
  // With no sales at all it falls back to the newest release alone ("New
  // Release" badge). stockPolicy's "sold" is lifetime and releases have no
  // StockPolicy, so neither number can come from it.
  type Pick = { productId: string; weeklySold: number; totalSold: number };
  const picks: Pick[] = weeklyTopSellers.map((w) => ({ productId: w.productId, weeklySold: w._count.productId, totalSold: 0 }));
  for (const t of allTimeTopSellers) {
    if (picks.length >= HERO_SLIDES) break;
    if (!picks.some((p) => p.productId === t.productId)) picks.push({ productId: t.productId, weeklySold: 0, totalSold: t._sum.quantity ?? 0 });
  }
  const missingIds = picks.map((p) => p.productId).filter((id) => !newReleases.some((p) => p.id === id));
  const extra = missingIds.length ? await db.product.findMany({ where: { id: { in: missingIds } }, include: discoverCardInclude }) : [];
  const pool = [...newReleases, ...extra];
  type HeroProduct = (typeof pool)[number];
  const heroes: { product: HeroProduct; weeklySold: number; totalSold: number }[] = [];
  for (const p of picks) {
    const product = pool.find((x) => x.id === p.productId);
    if (product) heroes.push({ product, weeklySold: p.weeklySold, totalSold: p.totalSold });
  }
  if (heroes.length === 0 && newReleases[0]) heroes.push({ product: newReleases[0], weeklySold: 0, totalSold: 0 });

  // `hero`/`heroWeeklySold` stay for app builds from before the carousel.
  const hero = heroes[0]?.product ?? null;
  const heroWeeklySold = heroes[0]?.weeklySold ?? 0;
  const heroIds = new Set(heroes.map((h) => h.product.id));
  const newReleasesBelowHero = newReleases.filter((p) => !heroIds.has(p.id));

  return {
    heroes,
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
