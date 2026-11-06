import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";
import { GENRES, isGenre } from "@/lib/music/tags";

export const MUSIC_SORTS = ["new", "top", "free"] as const;
export type MusicSort = (typeof MUSIC_SORTS)[number];

// Moods were removed 2026-11-04; a `mood` param from older links/app builds is just ignored.
export type MusicTabQuery = { genre?: string | null; sort?: string | null; q?: string | null };

/** Cleans raw query params into a safe, known filter. Unknown values are dropped, not errors. */
export function parseMusicTabQuery(raw: MusicTabQuery) {
  return {
    genre: isGenre(raw.genre) ? raw.genre : null,
    sort: (MUSIC_SORTS as readonly string[]).includes(raw.sort ?? "") ? (raw.sort as MusicSort) : "new",
    q: (raw.q ?? "").trim().slice(0, 80) || null,
  };
}

const TAKE = 60;

/**
 * The Music tab (V1.2, explicit ask 2026-10-21): published releases filtered
 * by genre and an optional search, sorted newest / best-selling / free only.
 * Shared by the web Discover page and /api/discover so web and mobile show
 * exactly the same results. Releases with no genre yet still appear whenever
 * no genre filter is set.
 */
export async function getMusicTab(query: ReturnType<typeof parseMusicTabQuery>) {
  const { genre, sort, q } = query;
  // A search word that names a genre ("amapiano", "hip hop") also matches releases tagged with it.
  const genreFromQ = q ? GENRES.find((g) => g.label.toLowerCase() === q.toLowerCase() || g.slug === q.toLowerCase().replace(/\s+/g, "-")) : undefined;

  const where: Prisma.ProductWhereInput = {
    type: "RELEASE",
    status: "PUBLISHED",
    ...(sort === "free" ? { priceKobo: 0 } : {}),
    ...(genre ? { release: { genres: { has: genre } } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { creator: { displayName: { contains: q, mode: "insensitive" } } },
            { creator: { handle: { contains: q, mode: "insensitive" } } },
            ...(genreFromQ ? [{ release: { genres: { has: genreFromQ.slug } } }] : []),
          ],
        }
      : {}),
  };

  if (sort !== "top") {
    return db.product.findMany({ where, include: discoverCardInclude, orderBy: { publishedAt: "desc" }, take: TAKE });
  }

  // Top Selling (fix, 2026-11-04): only releases that have actually sold,
  // most copies first. Counted from paid order lines (a refunded order is no
  // longer PAID, and a free claim at ₦0 isn't a sale) — releases have no
  // StockPolicy, so the old `stockPolicy.sold` sort ranked nothing and
  // simply listed every song.
  const sales = await db.orderItem.groupBy({
    by: ["productId"],
    where: { priceKobo: { gt: 0 }, order: { status: "PAID" }, product: where },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: TAKE,
  });
  if (sales.length === 0) return [];
  const products = await db.product.findMany({
    where: { id: { in: sales.map((s) => s.productId) } },
    include: discoverCardInclude,
  });
  const rank = new Map(sales.map((s, i) => [s.productId, i]));
  return products.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
