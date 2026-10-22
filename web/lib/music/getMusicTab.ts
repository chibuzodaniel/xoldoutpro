import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";
import { GENRES, isGenre, isMood } from "@/lib/music/tags";

export const MUSIC_SORTS = ["new", "top", "free"] as const;
export type MusicSort = (typeof MUSIC_SORTS)[number];

export type MusicTabQuery = { genre?: string | null; mood?: string | null; sort?: string | null; q?: string | null };

/** Cleans raw query params into a safe, known filter. Unknown values are dropped, not errors. */
export function parseMusicTabQuery(raw: MusicTabQuery) {
  return {
    genre: isGenre(raw.genre) ? raw.genre : null,
    mood: isMood(raw.mood) ? raw.mood : null,
    sort: (MUSIC_SORTS as readonly string[]).includes(raw.sort ?? "") ? (raw.sort as MusicSort) : "new",
    q: (raw.q ?? "").trim().slice(0, 80) || null,
  };
}

/**
 * The Music tab (V1.2, explicit ask 2026-10-21): published releases filtered
 * by genre and/or mood and an optional search, sorted newest / best-selling /
 * free only. Shared by the web Discover page and /api/discover so web and
 * mobile show exactly the same results. Releases with no genre yet still
 * appear whenever no genre/mood filter is set.
 */
export async function getMusicTab(query: ReturnType<typeof parseMusicTabQuery>) {
  const { genre, mood, sort, q } = query;
  const releaseFilter: Prisma.ReleaseWhereInput = {
    ...(genre ? { genres: { has: genre } } : {}),
    ...(mood ? { moods: { has: mood } } : {}),
  };
  // A search word that names a genre ("amapiano", "hip hop") also matches releases tagged with it.
  const genreFromQ = q ? GENRES.find((g) => g.label.toLowerCase() === q.toLowerCase() || g.slug === q.toLowerCase().replace(/\s+/g, "-")) : undefined;

  const where: Prisma.ProductWhereInput = {
    type: "RELEASE",
    status: "PUBLISHED",
    ...(sort === "free" ? { priceKobo: 0 } : {}),
    ...(genre || mood ? { release: releaseFilter } : {}),
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

  return db.product.findMany({
    where,
    include: discoverCardInclude,
    orderBy: sort === "top" ? [{ stockPolicy: { sold: "desc" } }, { publishedAt: "desc" }] : { publishedAt: "desc" },
    take: 60,
  });
}
