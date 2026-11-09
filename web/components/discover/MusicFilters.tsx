import Link from "next/link";
import { GENRES } from "@/lib/music/tags";
import type { parseMusicTabQuery, MusicSort } from "@/lib/music/getMusicTab";

type Query = ReturnType<typeof parseMusicTabQuery>;

// v2 Discover → Music filters (design/v2-prototype): genre chips and the
// shortcut tiles. Same filters and URL params the Music tab always had
// (genre, sort, q) — /discover?type=RELEASE&… links from before still work.
const TILES: { sort: MusicSort; title: string; sub: string; icon: React.ReactNode }[] = [
  {
    sort: "new",
    title: "New Releases",
    sub: "Last 7 days",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" strokeLinejoin="round" />
        <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    sort: "top",
    title: "Top Selling",
    sub: "Most purchased",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 7h6v6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    sort: "free",
    title: "Free Songs",
    sub: "Download free",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M12 8v13M3 12h18M12 8S10.5 3 7.5 3a2.5 2.5 0 000 5H12zm0 0s1.5-5 4.5-5a2.5 2.5 0 010 5H12z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function hrefFor(current: Query, next: Partial<Query>) {
  const merged = { ...current, ...next };
  const params = new URLSearchParams();
  if (merged.genre) params.set("genre", merged.genre);
  if (merged.sort && merged.sort !== "new") params.set("sort", merged.sort);
  if (merged.q) params.set("q", merged.q);
  const s = params.toString();
  return s ? `/discover?${s}` : "/discover";
}

export function MusicFilters({ query }: { query: Query }) {
  return (
    <div className="mt-4">
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Link
          href={hrefFor(query, { genre: null })}
          className={`shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold ${!query.genre ? "bg-white text-black" : "border border-line bg-surface text-ink-2"}`}
        >
          All
        </Link>
        {GENRES.map((g) => {
          const active = query.genre === g.slug;
          return (
            <Link
              key={g.slug}
              href={hrefFor(query, { genre: active ? null : g.slug })}
              className={`shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold ${active ? "bg-white text-black" : "border border-line bg-surface text-ink-2"}`}
            >
              {g.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {TILES.map((t) => {
          const active = query.sort === t.sort;
          return (
            <Link
              key={t.sort}
              href={hrefFor(query, { sort: t.sort })}
              className={`flex w-[148px] shrink-0 flex-col gap-3 rounded-2xl border bg-surface p-3.5 ${active ? "border-red" : "border-line"}`}
            >
              <span className="text-red-soft">{t.icon}</span>
              <span>
                <span className="block text-[15px] font-bold leading-tight">{t.title}</span>
                <span className="block text-[12px] text-ink-3 mt-0.5">{t.sub}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
