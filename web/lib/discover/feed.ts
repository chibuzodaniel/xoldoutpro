import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";

// v2 Discover feed (design/v2-prototype, 2026-11-09): the big-card feed under
// For You / Following. Queries here are additive on purpose — getMusicTab and
// /api/discover (which the mobile app reads) stay exactly as they were; the
// extra fields a feed card needs are fetched separately and merged in.

export type FeedSection = "RELEASE" | "BEAT" | "MERCH" | "EVENT";

const FEED_TAKE = 40;

type CardProduct = Prisma.ProductGetPayload<{ include: typeof discoverCardInclude }>;

export type FeedExtras = {
  firstTrack: { id: string; title: string; lyricsText: string | null } | null;
  isVerified: boolean;
  verificationBadges: string[];
};

export type FeedProduct = CardProduct & FeedExtras;

/**
 * The few things a feed card shows that the shared card query doesn't carry:
 * the first track (so the play button can start its preview) and the
 * artist's verified badge. One query for the whole page, not one per card.
 */
export async function withFeedExtras(products: CardProduct[]): Promise<FeedProduct[]> {
  if (products.length === 0) return [];
  const rows = await db.product.findMany({
    where: { id: { in: products.map((p) => p.id) } },
    select: {
      id: true,
      creator: { select: { isVerified: true, verificationBadges: true } },
      release: { select: { tracks: { orderBy: { order: "asc" }, take: 1, select: { id: true, title: true, lyricsText: true } } } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return products.map((p) => {
    const r = byId.get(p.id);
    return {
      ...p,
      firstTrack: r?.release?.tracks[0] ?? null,
      isVerified: r?.creator.isVerified ?? false,
      verificationBadges: (r?.creator.verificationBadges as string[] | undefined) ?? [],
    };
  });
}

/** Newest published Beats or Merch, with an optional title/artist search. */
export async function getSectionFeed(type: "BEAT" | "MERCH", q: string | null) {
  const products = await db.product.findMany({
    where: {
      type,
      status: "PUBLISHED",
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { creator: { displayName: { contains: q, mode: "insensitive" } } },
              { creator: { handle: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: discoverCardInclude,
    orderBy: { publishedAt: "desc" },
    take: FEED_TAKE,
  });
  return withFeedExtras(products);
}

/** Upcoming published events, soonest first, with an optional title search. */
export async function getEventFeed(q: string | null) {
  const now = Date.now();
  const events = await db.event.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    include: {
      creator: { select: { handle: true, displayName: true, isVerified: true, verificationBadges: true } },
      tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: FEED_TAKE,
  });
  // Worked out here, not while rendering, so the card stays a pure render.
  return events.map((ev) => ({ ...ev, isLive: ev.startsAt.getTime() <= now }));
}

/** Newest releases, beats and merch from the artists this user follows. */
export async function getFollowingFeed(userId: string) {
  const follows = await db.follow.findMany({ where: { followerId: userId }, select: { followedId: true }, take: 500 });
  if (follows.length === 0) return { followsAnyone: false, products: [] as FeedProduct[] };
  const products = await db.product.findMany({
    where: { creatorId: { in: follows.map((f) => f.followedId) }, type: { in: ["RELEASE", "BEAT", "MERCH"] }, status: "PUBLISHED" },
    include: discoverCardInclude,
    orderBy: { publishedAt: "desc" },
    take: FEED_TAKE,
  });
  return { followsAnyone: true, products: await withFeedExtras(products) };
}

/**
 * Releases with the most paid sales in the last 7 days — the feed marks
 * these TRENDING. One grouped query; a free claim (₦0) isn't a sale.
 */
export async function getTrendingReleaseIds(take = 5): Promise<Set<string>> {
  const rows = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      priceKobo: { gt: 0 },
      quantity: { gt: 0 },
      order: { status: "PAID", createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      product: { type: "RELEASE", status: "PUBLISHED" },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take,
  });
  return new Set(rows.map((r) => r.productId));
}
