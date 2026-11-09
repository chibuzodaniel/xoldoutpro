import Link from "next/link";
import { SectionSwitcher } from "./SectionSwitcher";

export type DiscoverSection = "RELEASE" | "BEAT" | "EVENT" | "MERCH";

const SECTIONS: { type: DiscoverSection; label: string; placeholder: string; hint: string }[] = [
  { type: "RELEASE", label: "Music", placeholder: "Search artists, songs, albums, genres", hint: "Search by Artist · Song · Album/EP · Genre" },
  { type: "BEAT", label: "Beats", placeholder: "Search beats and producers", hint: "Search by Beat · Producer" },
  { type: "EVENT", label: "Events", placeholder: "Search events", hint: "Search by Event name" },
  { type: "MERCH", label: "Merch", placeholder: "Search merch and artists", hint: "Search by Item · Artist" },
];

export function sectionHref(type: DiscoverSection) {
  return type === "RELEASE" ? "/discover" : `/discover?type=${type}`;
}

// v2 Discover heading block (design/v2-prototype): the big serif title, a
// search box that searches within the current section, and the
// Music / Beats / Events / Merch pills. Plain links and a GET form — the
// page stays server-rendered with no client fetching.
export function DiscoverTop({ section, q }: { section: DiscoverSection; q: string | null }) {
  const current = SECTIONS.find((s) => s.type === section) ?? SECTIONS[0];
  return (
    <div className="px-4 pt-6">
      <h1 className="font-serif text-[44px] font-bold leading-none tracking-tight">Discover</h1>

      <form action="/discover" method="get" className="relative mt-5">
        {section !== "RELEASE" && <input type="hidden" name="type" value={section} />}
        <svg viewBox="0 0 24 24" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder={current.placeholder}
          aria-label={current.placeholder}
          className="w-full rounded-2xl border border-line bg-surface py-3.5 pl-12 pr-4 text-[15px] outline-none placeholder:text-ink-3 focus:border-red"
        />
      </form>
      <p className="mt-2 text-[12px] text-ink-3">{current.hint}</p>

      <div className="-mx-4 mt-5 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {SECTIONS.map((s) => (
          <Link
            key={s.type}
            href={sectionHref(s.type)}
            className={`shrink-0 rounded-full px-6 py-3 text-[16px] font-semibold transition-colors duration-150 ${
              s.type === section ? "bg-red text-white" : "border border-line bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
      {/* Marker for the floating "Music ▾" switcher once these pills scroll away. */}
      <div id="discover-pills-end" aria-hidden />
      <SectionSwitcher
        current={section}
        sections={SECTIONS.map((s) => ({ type: s.type, label: s.label, href: sectionHref(s.type) }))}
        markerId="discover-pills-end"
      />
    </div>
  );
}
