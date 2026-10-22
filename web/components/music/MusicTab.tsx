import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { OwnedBadgesProvider } from "@/components/product/OwnedBadges";
import { GENRES, MOODS, genreLabel, moodLabel } from "@/lib/music/tags";
import type { getMusicTab, parseMusicTabQuery, MusicSort } from "@/lib/music/getMusicTab";

type Query = ReturnType<typeof parseMusicTabQuery>;

const SORT_TILES: { sort: MusicSort; title: string; blurb: string; badge: string; icon: string }[] = [
  { sort: "new", title: "New Releases", blurb: "Fresh drops from your favourite artists", badge: "NEW", icon: "✦" },
  { sort: "top", title: "Top Selling", blurb: "Most bought tracks & albums", badge: "", icon: "♛" },
  { sort: "free", title: "Free Songs", blurb: "Great music. No cost.", badge: "FREE", icon: "♫" },
];

function hrefFor(current: Query, next: Partial<Query>) {
  const merged = { ...current, ...next };
  const params = new URLSearchParams({ type: "RELEASE" });
  if (merged.genre) params.set("genre", merged.genre);
  if (merged.mood) params.set("mood", merged.mood);
  if (merged.sort && merged.sort !== "new") params.set("sort", merged.sort);
  if (merged.q) params.set("q", merged.q);
  return `/discover?${params.toString()}`;
}

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
    active ? "border-red bg-red text-white shadow-[0_0_14px_rgba(225,29,46,0.45)]" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
  }`;

// The Music tab (V1.2, explicit ask 2026-10-21, after the mockup): search,
// genre and mood chips, New Releases / Top Selling / Free Songs tiles, and
// the results grid. Everything is a plain link/form (URL params), so it
// works as a server-rendered page with no client fetching.
export function MusicTab({ query, products }: { query: Query; products: Awaited<ReturnType<typeof getMusicTab>> }) {
  const activeTile = SORT_TILES.find((t) => t.sort === query.sort) ?? SORT_TILES[0];
  const filterBits = [query.genre && genreLabel(query.genre), query.mood && moodLabel(query.mood), query.q && `“${query.q}”`].filter(Boolean);

  return (
    <div className="px-4">
      <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-serif text-4xl leading-none">Music</h2>
          <p className="text-sm text-ink-3 mt-1">Discover. Support. Own.</p>
        </div>
        <form action="/discover" method="get" className="relative w-full sm:max-w-xs">
          <input type="hidden" name="type" value="RELEASE" />
          {query.genre && <input type="hidden" name="genre" value={query.genre} />}
          {query.mood && <input type="hidden" name="mood" value={query.mood} />}
          {query.sort !== "new" && <input type="hidden" name="sort" value={query.sort} />}
          <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search artist, song, genre…"
            aria-label="Search music"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-red"
          />
        </form>
      </div>

      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Genres</p>
      <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 mb-4 [scrollbar-width:none]">
        <Link href={hrefFor(query, { genre: null })} className={chip(!query.genre)}>
          All
        </Link>
        {GENRES.map((g) => (
          <Link key={g.slug} href={hrefFor(query, { genre: query.genre === g.slug ? null : g.slug })} className={chip(query.genre === g.slug)}>
            {g.label}
          </Link>
        ))}
      </div>

      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Mood</p>
      <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-1 mb-5 [scrollbar-width:none]">
        {MOODS.map((m) => (
          <Link key={m.slug} href={hrefFor(query, { mood: query.mood === m.slug ? null : m.slug })} className={chip(query.mood === m.slug)}>
            <span className="mr-1" aria-hidden>
              {m.icon}
            </span>
            {m.label}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-6">
        {SORT_TILES.map((t) => {
          const active = t.sort === query.sort;
          return (
            <Link
              key={t.sort}
              href={hrefFor(query, { sort: t.sort })}
              className={`relative overflow-hidden rounded-xl border p-3 min-h-[118px] flex flex-col justify-between bg-gradient-to-br from-red/30 via-surface to-black ${
                active ? "border-red" : "border-line-soft hover:border-line"
              }`}
            >
              <div className="flex items-center justify-between">
                {t.badge ? (
                  <span className="rounded-md bg-red px-1.5 py-[2px] text-[9px] font-bold text-white">{t.badge}</span>
                ) : (
                  <span className="text-red-soft text-lg leading-none" aria-hidden>
                    {t.icon}
                  </span>
                )}
              </div>
              <div>
                <p className="font-serif text-[15px] leading-tight">{t.title}</p>
                <p className="text-[10.5px] text-ink-3 leading-snug mt-0.5 line-clamp-2">{t.blurb}</p>
              </div>
              <span className="absolute right-2.5 bottom-2 text-ink-2" aria-hidden>
                →
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-serif text-xl">{activeTile.title}</h3>
        {activeTile.badge && <span className="rounded-md bg-red px-1.5 py-[2px] text-[9px] font-bold text-white">{activeTile.badge}</span>}
        {filterBits.length > 0 && <span className="text-xs text-ink-3 truncate">· {filterBits.join(" · ")}</span>}
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-line-soft p-6 text-center">
          <p className="text-sm text-ink-2">No songs here yet.</p>
          {filterBits.length > 0 && (
            <Link href="/discover?type=RELEASE" className="text-xs font-semibold text-red-soft mt-1 inline-block">
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <OwnedBadgesProvider productIds={products.map((p) => p.id)}>
          <div className="grid grid-cols-3 gap-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </OwnedBadgesProvider>
      )}
    </div>
  );
}
