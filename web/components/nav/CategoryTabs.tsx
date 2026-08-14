const TABS = [
  { label: "All", enabled: true },
  { label: "Music", enabled: true },
  { label: "Beats", enabled: false },
  { label: "Events", enabled: false },
  { label: "Merch", enabled: false },
] as const;

// Beats/Events/Merch aren't built yet (Phase 2/3) — shown dimmed and
// non-interactive, same "visible but not yet enabled" treatment as the
// publish sheet, rather than hidden entirely.
export function CategoryTabs({ active }: { active: "All" | "Music" }) {
  return (
    <div className="flex items-center gap-5 px-4 border-b border-line-soft mb-4 overflow-x-auto">
      {TABS.map((tab) => (
        <span
          key={tab.label}
          className={`pb-2.5 text-[13px] font-semibold whitespace-nowrap ${
            !tab.enabled
              ? "text-ink-3/50"
              : tab.label === active
                ? "text-white border-b-2 border-red"
                : "text-ink-3"
          }`}
        >
          {tab.label}
        </span>
      ))}
    </div>
  );
}
