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
  // Song comments on this release/beat (all of its tracks), for the card's 💬.
  commentCount: number;
};

export type FeedProduct = CardProduct & FeedExtras;

/**
 * The few things a feed card shows that the shared card query doesn't carry:
 * the first track (so the play button can start its preview) and the
 * artist's verified badge. One query for the whole page, not one per card.
 */
export async function withFeedExtras(products: CardProduct[]): Promise<FeedProduct[]> {
  if (products.length === 0) return [];
  const ids = products.map((p) => p.id);
  const [rows, comments] = await Promise.all([
    db.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        creator: { select: { isVerified: true, verificationBadges: true } },
        release: { select: { tracks: { orderBy: { order: "asc" }, take: 1, select: { id: true, title: true, lyricsText: true } } } },
      },
    }),
    db.songComment.groupBy({ by: ["productId"], where: { productId: { in: ids } }, _count: { _all: true } }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const commentsBy = new Map(comments.map((c) => [c.productId, c._count._all]));
  return products.map((p) => {
    const r = byId.get(p.id);
    return {
      ...p,
      firstTrack: r?.release?.tracks[0] ?? null,
      isVerified: r?.creator.isVerified ?? false,
      verificationBadges: (r?.creator.verificationBadges as string[] | undefined) ?? [],
      commentCount: commentsBy.get(p.id) ?? 0,
    };
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Beats or Merch for Discover, with the v2 section chip (beat genre / merch
 * category) and shortcut tile (lib/discover/sectionFilters.ts) applied. One
 * indexed query; ordering is done by the database.
 */
export async function getSectionFeed(type: "BEAT" | "MERCH", q: string | null, chip: string | null = null, tile: string | null = null) {
  const and: Prisma.ProductWhereInput[] = [{ type, status: "PUBLISHED" }];
  if (q)
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { creator: { displayName: { contains: q, mode: "insensitive" } } },
        { creator: { handle: { contains: q, mode: "insensitive" } } },
        ...(type === "BEAT"
          ? [{ beat: { OR: [{ genre: { equals: q, mode: "insensitive" as const } }, { mood: { equals: q, mode: "insensitive" as const } }] } }]
          : []),
      ],
    });
  if (chip) {
    // Older beats have no genre yet — fall back to a matching tag.
    and.push(
      type === "BEAT"
        ? { beat: { OR: [{ genre: chip }, { tags: { hasSome: [chip, chip.toLowerCase()] } }] } }
        : { merchItem: { category: chip } },
    );
  }
  let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ publishedAt: "desc" }];
  if (tile === "new") and.push({ publishedAt: { gte: new Date(Date.now() - (type === "BEAT" ? 7 : 14) * DAY_MS) } });
  if (tile === "free") and.push({ priceKobo: 0 });
  if (tile === "top") {
    and.push({ stockPolicy: { sold: { gt: 0 } } });
    orderBy = [{ stockPolicy: { sold: "desc" } }, { publishedAt: "desc" }];
  }
  if (tile === "popular") orderBy = [{ likeCount: "desc" }, { publishedAt: "desc" }];
  if (tile === "producers") orderBy = [{ creator: { followers: { _count: "desc" } } }, { publishedAt: "desc" }];
  if (tile === "featured") and.push({ creator: { isVerified: true } });

  const products = await db.product.findMany({
    where: { AND: and },
    include: { ...discoverCardInclude, beat: { select: { coverImageLadder: true, genre: true, bpm: true } } },
    orderBy,
    take: FEED_TAKE,
  });
  return withFeedExtras(products);
}

/** Today in Lagos (UTC+1, no DST) — "Happening Now" means today there. */
function lagosDayBounds() {
  const LAGOS_OFFSET = 60 * 60 * 1000;
  const start = Math.floor((Date.now() + LAGOS_OFFSET) / DAY_MS) * DAY_MS - LAGOS_OFFSET;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

/**
 * Upcoming published events, soonest first, with an optional search,
 * event-type chip and shortcut tile. "near" needs the viewer's city (from
 * Vercel's IP geolocation header, so no lookup of our own).
 */
export async function getEventFeed(q: string | null, chip: string | null = null, tile: string | null = null, city: string | null = null) {
  const now = Date.now();
  const and: Prisma.EventWhereInput[] = [{ status: "PUBLISHED" }, { startsAt: { gte: new Date(now - 6 * 60 * 60 * 1000) } }];
  if (q)
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { venue: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { creator: { displayName: { contains: q, mode: "insensitive" } } },
      ],
    });
  if (chip) and.push({ eventType: chip });
  if (tile === "now") {
    const { start, end } = lagosDayBounds();
    and.push({ startsAt: { gte: start, lt: end } });
  }
  if (tile === "near") {
    if (!city) return [];
    and.push({ isVirtual: false }, { OR: [{ city: { equals: city, mode: "insensitive" } }, { venue: { contains: city, mode: "insensitive" } }] });
  }
  if (tile === "free") and.push({ tiers: { some: { product: { priceKobo: 0, status: "PUBLISHED" } } } });

  const events = await db.event.findMany({
    where: { AND: and },
    include: {
      creator: { select: { handle: true, displayName: true, isVerified: true, verificationBadges: true } },
      tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } },
    },
    orderBy: { startsAt: "asc" },
    take: FEED_TAKE,
  });
  // Worked out here, not while rendering, so the card stays a pure render.
  const rows = events.map((ev) => ({ ...ev, isLive: ev.startsAt.getTime() <= now }));
  if (tile === "trending") {
    const sold = (ev: (typeof rows)[number]) => ev.tiers.reduce((n, t) => n + (t.product.stockPolicy?.sold ?? 0), 0);
    rows.sort((x, y) => sold(y) - sold(x));
  }
  return rows;
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
