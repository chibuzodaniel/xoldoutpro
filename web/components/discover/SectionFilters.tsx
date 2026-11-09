import Link from "next/link";
import { SECTION_CHIPS, SECTION_TILES, type SectionType, type TileIcon } from "@/lib/discover/sectionFilters";

// v2 Discover → Beats / Events / Merch filters (design/v2-prototype): the
// chip row (genre / event type / category) and the shortcut tiles. Plain
// links (?chip=…&tile=…), so the page stays server-rendered.

const ICONS: Record<TileIcon, React.ReactNode> = {
  sparkle: (
    <>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" strokeLinejoin="round" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" strokeLinejoin="round" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l6-6 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 7h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M12 8v13M3 12h18M12 8S10.5 3 7.5 3a2.5 2.5 0 000 5H12zm0 0s1.5-5 4.5-5a2.5 2.5 0 010 5H12z" strokeLinejoin="round" />
    </>
  ),
  star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" strokeLinejoin="round" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </>
  ),
  live: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8 8a5.5 5.5 0 000 8M16 8a5.5 5.5 0 010 8M5 5a10 10 0 000 14M19 5a10 10 0 010 14" strokeLinecap="round" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  badge: (
    <>
      <path d="M12 3l2.4 1.8 3 .1.9 2.9 2.4 1.8-1 2.9 1 2.9-2.4 1.8-.9 2.9-3 .1L12 21l-2.4-1.8-3-.1-.9-2.9-2.4-1.8 1-2.9-1-2.9 2.4-1.8.9-2.9 3-.1L12 3z" strokeLinejoin="round" />
      <path d="M8.5 12l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

type State = { chip: string | null; tile: string | null; q: string | null };

function hrefFor(type: SectionType, next: State) {
  const params = new URLSearchParams({ type });
  if (next.chip) params.set("chip", next.chip);
  if (next.tile) params.set("tile", next.tile);
  if (next.q) params.set("q", next.q);
  return `/discover?${params}`;
}

export function SectionFilters({ type, chip, tile, q }: { type: SectionType } & State) {
  const state = { chip, tile, q };
  const pill = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold ${active ? "bg-white text-black" : "border border-line bg-surface text-ink-2"}`;
  return (
    <div className="mt-4">
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Link href={hrefFor(type, { ...state, chip: null })} className={pill(!chip)}>
          All
        </Link>
        {SECTION_CHIPS[type].map((c) => {
          const active = chip === c;
          return (
            <Link key={c} href={hrefFor(type, { ...state, chip: active ? null : c })} className={pill(active)}>
              {c}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {SECTION_TILES[type].map((t) => {
          const active = tile === t.key;
          return (
            <Link
              key={t.key}
              href={hrefFor(type, { ...state, tile: active ? null : t.key })}
              aria-pressed={active}
              className={`flex w-[148px] shrink-0 flex-col gap-3 rounded-2xl border bg-surface p-3.5 ${active ? "border-red" : "border-line"}`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-red-soft" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                {ICONS[t.icon]}
              </svg>
              <span>
                <span className="block text-[15px] font-bold leading-tight">{t.title}</span>
                <span className="mt-0.5 block text-[12px] text-ink-3">{t.sub}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
