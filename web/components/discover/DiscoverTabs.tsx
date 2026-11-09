import Link from "next/link";
import { BroadcastIcon } from "@/components/live/LiveIcons";

export type DiscoverFeed = "foryou" | "following" | "charts";

const TABS: { feed: DiscoverFeed; label: string; href: string }[] = [
  { feed: "foryou", label: "For You", href: "/discover" },
  { feed: "following", label: "Following", href: "/discover?feed=following" },
  { feed: "charts", label: "Charts", href: "/discover?feed=charts" },
];

// v2 Discover top tabs (design/v2-prototype): For You / Following / Charts,
// with Go Live kept as an icon at the end of the row (it was a tab before).
export function DiscoverTabs({ active }: { active: DiscoverFeed }) {
  return (
    <div className="flex items-center gap-6 border-b border-line-soft px-4">
      {TABS.map((tab) => (
        <Link
          key={tab.feed}
          href={tab.href}
          className={`relative py-3 text-[16px] font-semibold whitespace-nowrap transition-colors duration-150 ${
            tab.feed === active ? "text-white" : "text-ink-3 hover:text-ink-2"
          }`}
        >
          {tab.label}
          {tab.feed === active && <span className="absolute -bottom-px left-0 right-0 h-[3px] rounded-full bg-red" />}
        </Link>
      ))}
      <Link href="/live" aria-label="Live" className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-white hover:text-red-soft">
        <BroadcastIcon className="h-6 w-6" />
      </Link>
    </div>
  );
}
