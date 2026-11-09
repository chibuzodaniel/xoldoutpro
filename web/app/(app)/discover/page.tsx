import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/nav/AppHeader";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { buildDiscoverMetadata } from "@/lib/og";
import { getActiveBillboards } from "@/lib/commerce/billboards";
import { BillboardRail } from "@/components/discover/BillboardRail";
import { OwnedBadgesProvider } from "@/components/product/OwnedBadges";
import { getMusicTab, parseMusicTabQuery } from "@/lib/music/getMusicTab";
import { getEventFeed, getSectionFeed, getTrendingReleaseIds, withFeedExtras } from "@/lib/discover/feed";
import { DiscoverTabs } from "@/components/discover/DiscoverTabs";
import { DiscoverTop, type DiscoverSection } from "@/components/discover/DiscoverTop";
import { MusicFilters } from "@/components/discover/MusicFilters";
import { FeedCard } from "@/components/discover/FeedCard";
import { EventFeedCard } from "@/components/discover/EventFeedCard";
import { FollowingFeed } from "@/components/discover/FollowingFeed";
import { getCharts, CHART_PERIODS, PERIOD_LABEL, type ChartPeriod, type ProductEntry } from "@/lib/charts/getCharts";
import { ProductChartRow, CreatorChartRow } from "@/components/charts/ChartRows";

// Stock/follower counts change often, but not so often that every single
// pageview needs to hit the DB — cache briefly and revalidate in the
// background instead of forcing a fresh render every time.
export const revalidate = 120;

export const metadata: Metadata = buildDiscoverMetadata();

const SECTIONS = ["RELEASE", "BEAT", "EVENT", "MERCH"] as const;

// v2 Discover (design/v2-prototype, 2026-11-09):
//   For You   — /discover[?type=BEAT|EVENT|MERCH][&genre&sort&q]: the big
//               title, search, section pills, then a feed of large cards.
//               Music (the default) keeps the Music tab's genre/sort filters.
//   Following — /discover?feed=following: new drops from followed artists.
//   Charts    — /discover?feed=charts: what the old "All" page showed —
//               best-sellers hero, the paid Billboard (sponsored), top
//               sellers, creators, beats, events and merch.
// Old links (?type=RELEASE&genre=…) still land in the right place, and
// /api/discover (the mobile app's feed) is unchanged.
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; genre?: string; sort?: string; q?: string; feed?: string; period?: string; chart?: string }>;
}) {
  const { type, genre, sort, q, feed, period, chart } = await searchParams;

  if (feed === "following") {
    return (
      <div className="pb-8">
        <AppHeader />
        <DiscoverTabs active="following" />
        <FollowingFeed />
      </div>
    );
  }

  if (feed === "charts") {
    const p = (CHART_PERIODS as readonly string[]).includes(period ?? "") ? (period as ChartPeriod) : "week";
    const c = CHART_SECTIONS.some((s) => s.key === chart) ? (chart as ChartKey) : null;
    return <ChartsView period={p} chart={c} />;
  }

  const section: DiscoverSection = (SECTIONS as readonly string[]).includes(type ?? "") ? (type as DiscoverSection) : "RELEASE";
  const search = (q ?? "").trim().slice(0, 80) || null;

  return (
    <div className="pb-8">
      <AppHeader />
      <DiscoverTabs active="foryou" />
      <DiscoverTop section={section} q={search} />
      {section === "RELEASE" ? <MusicFeed genre={genre} sort={sort} q={q} /> : section === "EVENT" ? <EventsFeed q={search} /> : <ProductsFeed type={section} q={search} />}
    </div>
  );
}

async function MusicFeed({ genre, sort, q }: { genre?: string; sort?: string; q?: string }) {
  const query = parseMusicTabQuery({ genre, sort, q });
  const [products, trending] = await Promise.all([getMusicTab(query).then(withFeedExtras), getTrendingReleaseIds()]);
  const filtered = Boolean(query.genre || query.q || query.sort !== "new");
  return (
    <>
      <MusicFilters query={query} />
      <FeedList
        empty={filtered ? "No songs match these filters." : "No songs here yet."}
        clearHref={filtered ? "/discover" : null}
        ids={products.map((p) => p.id)}
      >
        {products.map((p, i) => (
          <FeedCard key={p.id} product={p} trending={trending.has(p.id)} priority={i === 0} />
        ))}
      </FeedList>
    </>
  );
}

async function ProductsFeed({ type, q }: { type: "BEAT" | "MERCH"; q: string | null }) {
  const products = await getSectionFeed(type, q);
  return (
    <FeedList empty={q ? "Nothing matches that search." : "Nothing published yet."} clearHref={q ? `/discover?type=${type}` : null} ids={products.map((p) => p.id)}>
      {products.map((p, i) => (
        <FeedCard key={p.id} product={p} priority={i === 0} />
      ))}
    </FeedList>
  );
}

async function EventsFeed({ q }: { q: string | null }) {
  const events = await getEventFeed(q);
  return (
    <FeedList empty={q ? "No events match that search." : "No upcoming events yet."} clearHref={q ? "/discover?type=EVENT" : null} ids={[]}>
      {events.map((ev) => (
        <EventFeedCard
          key={ev.id}
          event={{ ...ev, creator: { ...ev.creator, verificationBadges: ev.creator.verificationBadges as string[] } }}
        />
      ))}
    </FeedList>
  );
}

function FeedList({ children, empty, clearHref, ids }: { children: React.ReactNode[]; empty: string; clearHref: string | null; ids: string[] }) {
  if (children.length === 0) {
    return (
      <div className="mx-4 mt-6 rounded-2xl border border-line-soft p-8 text-center">
        <p className="text-sm text-ink-2">{empty}</p>
        {clearHref && (
          <Link href={clearHref} className="mt-1 inline-block text-xs font-semibold text-red-soft">
            Clear search and filters
          </Link>
        )}
      </div>
    );
  }
  return (
    <OwnedBadgesProvider productIds={ids}>
      {/* One card per row on phones; a grid on wide screens so cards stay a sensible size. */}
      <div className="mt-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-6 xl:grid-cols-3">{children}</div>
    </OwnedBadgesProvider>
  );
}

const CHART_SECTIONS = [
  { key: "top", title: "Top Sellers", sub: "Verified completed sales only" },
  { key: "music", title: "Music Charts", sub: "What XOLDOUT is listening to and buying" },
  { key: "creators", title: "Top Creators", sub: "Ranked on sales, growth and engagement" },
  { key: "viral", title: "Viral", sub: "Most played by the people who own them" },
  { key: "rising", title: "Rising", sub: "Releases from the last 30 days that are taking off" },
  { key: "events", title: "Trending Events", sub: "Most tickets sold" },
  { key: "beats", title: "Trending Beats", sub: "Best-selling beats" },
  { key: "merch", title: "Top Merch", sub: "Best-selling merch" },
] as const;
type ChartKey = (typeof CHART_SECTIONS)[number]["key"];

function chartHref(period: ChartPeriod, chart?: ChartKey) {
  const params = new URLSearchParams({ feed: "charts" });
  if (period !== "week") params.set("period", period);
  if (chart) params.set("chart", chart);
  return `/discover?${params.toString()}`;
}

function salesStats(e: ProductEntry) {
  const bits = [`${e.buyers} ${e.buyers === 1 ? "sale" : "sales"}`];
  if (e.listeners) bits.push(`${e.listeners} ${e.listeners === 1 ? "listener" : "listeners"}`);
  return bits.join(" · ");
}

// v2 Charts (design/v2-prototype, 2026-11-09): ranked lists from
// lib/charts/getCharts.ts (cached 10 min per period), with Today / This Week /
// This Month / All Time. ?chart=<key> shows one chart on its own ("See all").
async function ChartsView({ period, chart }: { period: ChartPeriod; chart: ChartKey | null }) {
  const [charts, billboards] = await Promise.all([getCharts(period), chart ? Promise.resolve([]) : getActiveBillboards()]);
  const productIds = [...charts.topSellers, ...charts.music, ...charts.viral, ...charts.rising, ...charts.beats, ...charts.merch].map((e) => e.product.id);
  const sections = CHART_SECTIONS.filter((s) => !chart || s.key === chart);

  function productList(list: ProductEntry[]) {
    return list.length === 0 ? (
      <p className="py-4 text-sm text-ink-3">Nothing here yet for {PERIOD_LABEL[period].toLowerCase()}.</p>
    ) : (
      <ol>
        {list.map((e, i) => (
          <ProductChartRow key={e.product.id} rank={i + 1} movement={e.movement} product={e.product} stats={salesStats(e)} />
        ))}
      </ol>
    );
  }

  function body(key: ChartKey) {
    switch (key) {
      case "top":
        return productList(charts.topSellers);
      case "music":
        return productList(charts.music);
      case "viral":
        return productList(charts.viral);
      case "rising":
        return productList(charts.rising);
      case "beats":
        return productList(charts.beats);
      case "merch":
        return productList(charts.merch);
      case "creators":
        return charts.creators.length === 0 ? (
          <p className="py-4 text-sm text-ink-3">Nothing here yet for {PERIOD_LABEL[period].toLowerCase()}.</p>
        ) : (
          <ol>
            {charts.creators.map((e, i) => (
              <CreatorChartRow
                key={e.creator.id}
                rank={i + 1}
                movement={e.movement}
                creator={e.creator}
                stats={`${e.buyers} ${e.buyers === 1 ? "buyer" : "buyers"} · +${e.newFollowers} followers`}
              />
            ))}
          </ol>
        );
      case "events":
        return charts.events.length === 0 ? (
          <p className="py-4 text-sm text-ink-3">No ticket sales yet for {PERIOD_LABEL[period].toLowerCase()}.</p>
        ) : (
          <ol>
            {charts.events.map((e, i) => (
              <li key={e.event.id} className="flex gap-3 border-b border-line-soft py-4">
                <span className={`w-10 shrink-0 text-center font-serif text-[30px] font-bold leading-none ${i < 3 ? "text-red-soft" : "text-ink"}`}>{i + 1}</span>
                <Link href={`/e/${e.event.id}`} className="flex min-w-0 flex-1 gap-3">
                  <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-red/50 to-black">
                    <FallbackImg src={(e.event.coverImageLadder as Record<string, string> | null)?.["256"] ?? null} alt={e.event.title} className="h-full w-full object-cover" fallback={null} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{e.event.title}</span>
                    <span className="block truncate text-[14px] text-ink-2">{e.event.creator.displayName}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {e.tickets} tickets sold ·{" "}
                      {new Date(e.event.startsAt).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                      {e.event.isVirtual ? "Virtual" : (e.event.venue ?? "Venue TBA")}
                    </span>
                  </span>
                </Link>
                <Link href={`/e/${e.event.id}`} className="self-center rounded-full bg-red px-4 py-2 text-[13px] font-bold text-white">
                  Buy Ticket
                </Link>
              </li>
            ))}
          </ol>
        );
    }
  }

  return (
    <OwnedBadgesProvider productIds={productIds}>
      <div className="pb-8">
        <AppHeader />
        <DiscoverTabs active="charts" />
        <div className="px-4 pt-6 md:px-6">
          {chart ? (
            <Link href={chartHref(period)} className="text-sm font-semibold text-red-soft">
              ‹ All charts
            </Link>
          ) : null}
          <h1 className="mt-1 font-serif text-[44px] font-bold leading-none tracking-tight">{chart ? sections[0]?.title : "Charts"}</h1>
          <div className="-mx-4 mt-5 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {CHART_PERIODS.map((p) => (
              <Link
                key={p}
                href={chartHref(p, chart ?? undefined)}
                className={`shrink-0 rounded-full px-5 py-2.5 text-[15px] font-semibold ${p === period ? "bg-red text-white" : "border border-line bg-surface text-ink-2"}`}
              >
                {PERIOD_LABEL[p]}
              </Link>
            ))}
          </div>
        </div>

        <div className="px-4 md:px-6 lg:grid lg:grid-cols-2 lg:gap-x-10">
          {sections.map((s, i) => (
            <section key={s.key} className="mt-8 min-w-0">
              <div className="mb-1 flex items-end justify-between">
                <div>
                  <h2 className="font-serif text-[28px] font-bold leading-tight">{s.title}</h2>
                  <p className="text-xs text-ink-3">{s.sub}</p>
                </div>
                {!chart && (
                  <Link href={chartHref(period, s.key)} className="text-sm font-semibold text-red-soft">
                    See all ›
                  </Link>
                )}
              </div>
              {body(s.key)}
              {/* The paid Billboard sits after Top Creators, labelled Sponsored. It never affects rankings. */}
              {!chart && i === 2 && billboards.length > 0 && (
                <div className="mt-8">
                  <h2 className="font-serif text-[28px] font-bold leading-tight">Billboard</h2>
                  <p className="mb-3 text-xs text-ink-3">Sponsored</p>
                  <BillboardRail slides={billboards} />
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </OwnedBadgesProvider>
  );
}
