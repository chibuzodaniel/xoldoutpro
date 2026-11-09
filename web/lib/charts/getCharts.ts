import { unstable_cache } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";
import { withFeedExtras, type FeedProduct } from "@/lib/discover/feed";

// Charts (design/v2-prototype, 2026-11-09). Ranked from data that already
// exists — paid orders, plays, follows — no new tables. Rules from the
// prototype's notes:
//   - only completed (PAID) payments count; free ₦0 claims and tip-only
//     orders are not sales;
//   - repeat activity from one account counts once (distinct buyers /
//     listeners / followers, not raw totals);
//   - Billboard is paid and labelled Sponsored and never affects rankings.
// Plays: TrackPlay.productId is only set for plays of something the listener
// owns, so per-song plays are "listeners who own it".
// Each period's charts are computed together and cached for 10 minutes
// (Vercel CPU budget, CLAUDE.md) — never per request.

export const CHART_PERIODS = ["today", "week", "month", "all"] as const;
export type ChartPeriod = (typeof CHART_PERIODS)[number];

export const PERIOD_LABEL: Record<ChartPeriod, string> = { today: "Today", week: "This Week", month: "This Month", all: "All Time" };

const PERIOD_MS: Record<Exclude<ChartPeriod, "all">, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

export type Movement = { kind: "new" } | { kind: "up" | "down"; by: number } | { kind: "same" } | null;

export type ProductEntry = { product: FeedProduct; buyers: number; revenueKobo: number; listeners: number; movement: Movement };
export type CreatorEntry = {
  creator: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean; verificationBadges: string[]; followers: number };
  buyers: number;
  newFollowers: number;
  movement: Movement;
};
export type EventEntry = {
  event: {
    id: string;
    title: string;
    startsAt: Date;
    venue: string | null;
    isVirtual: boolean;
    coverImageLadder: unknown;
    creator: { handle: string; displayName: string; isVerified: boolean; verificationBadges: string[] };
    minPriceKobo: number | null;
  };
  tickets: number;
};

export type Charts = {
  period: ChartPeriod;
  topSellers: ProductEntry[];
  music: ProductEntry[];
  viral: ProductEntry[];
  rising: ProductEntry[];
  beats: ProductEntry[];
  merch: ProductEntry[];
  creators: CreatorEntry[];
  events: EventEntry[];
};

type Window = { from: Date | null; to: Date | null };

function windows(period: ChartPeriod, now: number): { cur: Window; prev: Window | null } {
  if (period === "all") return { cur: { from: null, to: null }, prev: null };
  const len = PERIOD_MS[period];
  return { cur: { from: new Date(now - len), to: null }, prev: { from: new Date(now - 2 * len), to: new Date(now - len) } };
}

function timeFilter(column: Prisma.Sql, w: Window) {
  return Prisma.sql`${w.from ? Prisma.sql`AND ${column} >= ${w.from}` : Prisma.empty} ${w.to ? Prisma.sql`AND ${column} < ${w.to}` : Prisma.empty}`;
}

type SalesRow = { productId: string; buyers: number; revenue: number };

/** Distinct paying buyers (and revenue) per product in a window. */
async function productSales(w: Window, take: number) {
  return db.$queryRaw<SalesRow[]>`
    SELECT oi."productId", COUNT(DISTINCT o."buyerId")::int AS buyers, COALESCE(SUM(oi."priceKobo" * oi."quantity"), 0)::int AS revenue
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "Product" p ON p."id" = oi."productId"
    WHERE o."status" = 'PAID' AND o."isTipOnly" = false AND oi."quantity" > 0 AND oi."priceKobo" > 0
      AND p."status" = 'PUBLISHED' AND p."type" <> 'EVENT'
      ${timeFilter(Prisma.sql`o."createdAt"`, w)}
    GROUP BY oi."productId"
    ORDER BY buyers DESC, revenue DESC
    LIMIT ${take}
  `;
}

/** Distinct owning listeners per product in a window. */
async function productListeners(w: Window, take: number) {
  return db.$queryRaw<{ productId: string; listeners: number }[]>`
    SELECT tp."productId", COUNT(DISTINCT tp."userId")::int AS listeners
    FROM "TrackPlay" tp
    WHERE tp."productId" IS NOT NULL ${timeFilter(Prisma.sql`tp."createdAt"`, w)}
    GROUP BY tp."productId"
    ORDER BY listeners DESC
    LIMIT ${take}
  `;
}

/** Distinct paying buyers per creator in a window. */
async function creatorSales(w: Window, take: number) {
  return db.$queryRaw<{ creatorId: string; buyers: number }[]>`
    SELECT p."creatorId", COUNT(DISTINCT o."buyerId")::int AS buyers
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "Product" p ON p."id" = oi."productId"
    WHERE o."status" = 'PAID' AND o."isTipOnly" = false AND oi."quantity" > 0 AND oi."priceKobo" > 0
      ${timeFilter(Prisma.sql`o."createdAt"`, w)}
    GROUP BY p."creatorId"
    ORDER BY buyers DESC
    LIMIT ${take}
  `;
}

/** New followers per creator in a window (a follow is one account, once). */
async function creatorFollowGains(w: Window, take: number) {
  return db.$queryRaw<{ creatorId: string; gained: number }[]>`
    SELECT f."followedId" AS "creatorId", COUNT(*)::int AS gained
    FROM "Follow" f
    WHERE true ${timeFilter(Prisma.sql`f."createdAt"`, w)}
    GROUP BY f."followedId"
    ORDER BY gained DESC
    LIMIT ${take}
  `;
}

/** Tickets sold per upcoming/recent published event in a window. */
async function eventTickets(w: Window, take: number) {
  return db.$queryRaw<{ eventId: string; tickets: number }[]>`
    SELECT tt."eventId", COALESCE(SUM(oi."quantity"), 0)::int AS tickets
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "TicketTier" tt ON tt."productId" = oi."productId"
    JOIN "Event" e ON e."id" = tt."eventId"
    WHERE o."status" = 'PAID' AND oi."quantity" > 0 AND e."status" = 'PUBLISHED' AND e."startsAt" >= ${new Date(Date.now() - 24 * 60 * 60 * 1000)}
      ${timeFilter(Prisma.sql`o."createdAt"`, w)}
    GROUP BY tt."eventId"
    ORDER BY tickets DESC
    LIMIT ${take}
  `;
}

function rankMap(ids: string[]) {
  return new Map(ids.map((id, i) => [id, i]));
}

function movementFor(id: string, rank: number, prev: Map<string, number> | null): Movement {
  if (!prev) return null;
  const before = prev.get(id);
  if (before === undefined) return { kind: "new" };
  if (before === rank) return { kind: "same" };
  return before > rank ? { kind: "up", by: before - rank } : { kind: "down", by: rank - before };
}

const LIST = 10;
const POOL = 60;

async function computeCharts(period: ChartPeriod): Promise<Charts> {
  const { cur, prev } = windows(period, Date.now());
  const [sales, listeners, cSales, cFollows, events, prevSales, prevListeners, prevCSales, prevCFollows] = await Promise.all([
    productSales(cur, POOL),
    productListeners(cur, POOL),
    creatorSales(cur, POOL),
    creatorFollowGains(cur, POOL),
    eventTickets(cur, LIST),
    prev ? productSales(prev, POOL) : Promise.resolve(null),
    prev ? productListeners(prev, POOL) : Promise.resolve(null),
    prev ? creatorSales(prev, POOL) : Promise.resolve(null),
    prev ? creatorFollowGains(prev, POOL) : Promise.resolve(null),
  ]);

  const salesBy = new Map(sales.map((r) => [r.productId, r]));
  const listenBy = new Map(listeners.map((r) => [r.productId, r.listeners]));
  const ids = [...new Set([...sales.map((r) => r.productId), ...listeners.map((r) => r.productId)])];
  const rows = ids.length
    ? await db.product.findMany({ where: { id: { in: ids }, status: "PUBLISHED" }, include: discoverCardInclude })
    : [];
  const products = new Map((await withFeedExtras(rows)).map((p) => [p.id, p]));

  // Music score: a buyer counts more than a listener (paying is the strongest signal).
  const musicScore = (id: string) => (salesBy.get(id)?.buyers ?? 0) * 3 + (listenBy.get(id) ?? 0);
  const prevMusic = prevSales && prevListeners ? rankByScore(prevSales, prevListeners) : null;

  function entries(list: string[], prevRanks: Map<string, number> | null): ProductEntry[] {
    return list
      .map((id) => products.get(id))
      .filter((p): p is FeedProduct => Boolean(p))
      .slice(0, LIST)
      .map((product, i) => ({
        product,
        buyers: salesBy.get(product.id)?.buyers ?? 0,
        revenueKobo: salesBy.get(product.id)?.revenue ?? 0,
        listeners: listenBy.get(product.id) ?? 0,
        movement: movementFor(product.id, i, prevRanks),
      }));
  }

  const byType = (type: string) => (id: string) => products.get(id)?.type === type;
  const salesOrder = sales.map((r) => r.productId);
  const musicOrder = ids.filter(byType("RELEASE")).sort((a, b) => musicScore(b) - musicScore(a));
  const thirtyDaysAgo = Date.now() - PERIOD_MS.month;
  const risingOrder = musicOrder.filter((id) => {
    const at = products.get(id)?.publishedAt;
    return at ? new Date(at).getTime() >= thirtyDaysAgo : false;
  });
  const viralOrder = listeners.map((r) => r.productId).filter(byType("RELEASE"));

  // Creators: sales and growth (new followers).
  const cSalesBy = new Map(cSales.map((r) => [r.creatorId, r.buyers]));
  const cFollowBy = new Map(cFollows.map((r) => [r.creatorId, r.gained]));
  const creatorIds = [...new Set([...cSales.map((r) => r.creatorId), ...cFollows.map((r) => r.creatorId)])];
  const creatorScore = (id: string) => (cSalesBy.get(id) ?? 0) * 2 + (cFollowBy.get(id) ?? 0);
  const creatorOrder = creatorIds.sort((a, b) => creatorScore(b) - creatorScore(a)).slice(0, LIST);
  const prevCreatorRanks =
    prevCSales && prevCFollows
      ? (() => {
          const s = new Map(prevCSales.map((r) => [r.creatorId, r.buyers]));
          const f = new Map(prevCFollows.map((r) => [r.creatorId, r.gained]));
          const all = [...new Set([...s.keys(), ...f.keys()])];
          return rankMap(all.sort((a, b) => (s.get(b) ?? 0) * 2 + (f.get(b) ?? 0) - ((s.get(a) ?? 0) * 2 + (f.get(a) ?? 0))));
        })()
      : null;
  const users = creatorOrder.length
    ? await db.user.findMany({
        where: { id: { in: creatorOrder }, pendingGuestAt: null, deletedAt: null },
        select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true, _count: { select: { followers: true } } },
      })
    : [];
  const userBy = new Map(users.map((u) => [u.id, u]));
  const creators: CreatorEntry[] = creatorOrder
    .map((id) => userBy.get(id))
    .filter((u): u is (typeof users)[number] => Boolean(u))
    .map((u, i) => ({
      creator: {
        id: u.id,
        handle: u.handle,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isVerified: u.isVerified,
        verificationBadges: u.verificationBadges as string[],
        followers: u._count.followers,
      },
      buyers: cSalesBy.get(u.id) ?? 0,
      newFollowers: cFollowBy.get(u.id) ?? 0,
      movement: movementFor(u.id, i, prevCreatorRanks),
    }));

  const eventRows = events.length
    ? await db.event.findMany({
        where: { id: { in: events.map((e) => e.eventId) } },
        include: {
          creator: { select: { handle: true, displayName: true, isVerified: true, verificationBadges: true } },
          tiers: { select: { product: { select: { priceKobo: true } } } },
        },
      })
    : [];
  const eventBy = new Map(eventRows.map((e) => [e.id, e]));
  const eventEntries: EventEntry[] = events
    .map((r): EventEntry | null => {
      const e = eventBy.get(r.eventId);
      if (!e) return null;
      const prices = e.tiers.map((t) => t.product.priceKobo);
      return {
        event: {
          id: e.id,
          title: e.title,
          startsAt: e.startsAt,
          venue: e.venue,
          isVirtual: e.isVirtual,
          coverImageLadder: e.coverImageLadder,
          creator: { ...e.creator, verificationBadges: e.creator.verificationBadges as string[] },
          minPriceKobo: prices.length ? Math.min(...prices) : null,
        },
        tickets: r.tickets,
      };
    })
    .filter((x): x is EventEntry => Boolean(x));

  const prevSalesRanks = prevSales ? rankMap(prevSales.map((r) => r.productId)) : null;
  return {
    period,
    topSellers: entries(salesOrder, prevSalesRanks),
    music: entries(musicOrder, prevMusic),
    viral: entries(viralOrder, prevListeners ? rankMap(prevListeners.map((r) => r.productId)) : null),
    rising: entries(risingOrder, null),
    beats: entries(salesOrder.filter(byType("BEAT")), null),
    merch: entries(salesOrder.filter(byType("MERCH")), null),
    creators,
    events: eventEntries,
  };
}

function rankByScore(sales: SalesRow[], listeners: { productId: string; listeners: number }[]) {
  const s = new Map(sales.map((r) => [r.productId, r.buyers]));
  const l = new Map(listeners.map((r) => [r.productId, r.listeners]));
  const all = [...new Set([...s.keys(), ...l.keys()])];
  return rankMap(all.sort((a, b) => (s.get(b) ?? 0) * 3 + (l.get(b) ?? 0) - ((s.get(a) ?? 0) * 3 + (l.get(a) ?? 0))));
}

/** One period's charts, cached for 10 minutes. */
export function getCharts(period: ChartPeriod) {
  return unstable_cache(() => computeCharts(period), ["charts-v1", period], { revalidate: 600 })();
}
