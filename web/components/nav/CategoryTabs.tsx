import Link from "next/link";
import { BroadcastIcon } from "@/components/live/LiveIcons";

const TABS = [
  { label: "All", type: null },
  { label: "Music", type: "RELEASE" },
  { label: "Beats", type: "BEAT" },
  { label: "Events", type: "EVENT" },
  { label: "Merch", type: "MERCH" },
] as const;

export type CategoryType = (typeof TABS)[number]["type"];

// Not a ProductType filter like the tabs above — it navigates away to its
// own page (app/(app)/live) entirely, same as the mockup's placement in this
// same row. Styled distinctly (red broadcast icon) since it's never the
// "active" filter tab, just a permanent entry point.
export function CategoryTabs({ active }: { active: CategoryType }) {
  return (
    <div className="flex items-center gap-5 px-4 border-b border-line-soft mb-4 overflow-x-auto">
      {TABS.map((tab) => (
        <Link
          key={tab.label}
          href={tab.type ? `/discover?type=${tab.type}` : "/discover"}
          className={`relative pb-2.5 text-[14px] font-semibold whitespace-nowrap border-b-2 transition-colors duration-200 ${
            tab.type === active
              ? "text-white border-red"
              : "text-ink-3 border-transparent hover:text-ink-2 hover:border-line"
          }`}
        >
          {tab.label}
          {tab.type === active && (
            <span className="absolute -bottom-[2px] left-0 right-0 h-[2px] rounded-full bg-red shadow-[0_0_6px_0_rgba(225,29,46,0.65)]" />
          )}
        </Link>
      ))}
      <Link
        href="/live"
        className="relative pb-2.5 flex items-center gap-1.5 text-[14px] font-semibold whitespace-nowrap text-white border-b-2 border-transparent"
      >
        <BroadcastIcon className="h-[18px] w-[18px] text-red-soft" />
        Go Live
      </Link>
    </div>
  );
}
