import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { EventCard } from "@/components/product/EventCard";
import { AppHeader } from "@/components/nav/AppHeader";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { buildDiscoverMetadata } from "@/lib/og";
import { getDiscoverData } from "@/lib/discover/getDiscoverData";
import { getActiveBillboards } from "@/lib/commerce/billboards";
import { BillboardRail } from "@/components/discover/BillboardRail";
import { HeroCarousel } from "@/components/discover/HeroCarousel";
import { OwnedBadgesProvider } from "@/components/product/OwnedBadges";
import { getMusicTab, parseMusicTabQuery } from "@/lib/music/getMusicTab";
import { getEventFeed, getSectionFeed, getTrendingReleaseIds, withFeedExtras } from "@/lib/discover/feed";
import { DiscoverTabs } from "@/components/discover/DiscoverTabs";
import { DiscoverTop, type DiscoverSection } from "@/components/discover/DiscoverTop";
import { MusicFilters } from "@/components/discover/MusicFilters";
import { FeedCard } from "@/components/discover/FeedCard";
import { EventFeedCard } from "@/components/discover/EventFeedCard";
import { FollowingFeed } from "@/components/discover/FollowingFeed";

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
  searchParams: Promise<{ type?: string; genre?: string; sort?: string; q?: string; feed?: string }>;
}) {
  const { type, genre, sort, q, feed } = await searchParams;

  if (feed === "following") {
    return (
      <div className="pb-8">
        <AppHeader />
        <DiscoverTabs active="following" />
        <FollowingFeed />
      </div>
    );
  }

  if (feed === "charts") return <ChartsView />;

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
            Clear filters
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

async function ChartsView() {
  const [{ heroes, newReleasesBelowHero, weeklyTopCreators, topBeats, upcomingEvents, merchItems, creators }, billboards] = await Promise.all([
    getDiscoverData(),
    getActiveBillboards(),
  ]);
  const productIds = [...heroes.map((h) => h.product.id), ...newReleasesBelowHero.map((p) => p.id), ...topBeats.map((p) => p.id), ...merchItems.map((p) => p.id)];

  return (
    <OwnedBadgesProvider productIds={productIds}>
      <div className="pb-8">
        <AppHeader />
        <DiscoverTabs active="charts" />
        <div className="px-4 pt-6">
          <h1 className="font-serif text-[44px] font-bold leading-none tracking-tight">Charts</h1>
          <p className="mt-2 text-sm text-ink-3">What fans are buying and who&apos;s moving this week.</p>
        </div>

        <ChartSection title="Top Sellers" sub="Best-selling releases this week">
          {heroes.length > 0 ? <HeroCarousel slides={heroes} /> : <p className="px-4 text-sm text-ink-3">No sales yet this week.</p>}
        </ChartSection>

        {billboards.length > 0 && (
          <ChartSection title="Billboard" sub="Sponsored">
            <div className="px-4">
              <BillboardRail slides={billboards} />
            </div>
          </ChartSection>
        )}

        {weeklyTopCreators.length > 0 && (
          <ChartSection title="Top Creators" sub="Most sales this week" more={{ href: "/discover/top-creators", label: "View all" }}>
            <ol className="mx-4 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-surface">
              {weeklyTopCreators.slice(0, 10).map((c, i) => (
                <li key={c.id}>
                  <Link href={`/u/${c.handle}`} className="flex items-center gap-3 px-4 py-3">
                    <span className={`w-6 text-center font-serif text-xl font-bold ${i < 3 ? "text-red-soft" : "text-ink-3"}`}>{i + 1}</span>
                    <Avatar url={c.avatarUrl} name={c.displayName} index={i} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{c.displayName}</span>
                      <span className="block text-xs text-ink-3">{c.metric}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </ChartSection>
        )}

        {newReleasesBelowHero.length > 0 && (
          <ChartSection title="New This Week" sub="Fresh releases" more={{ href: "/discover?sort=new", label: "See all" }}>
            <Grid>
              {newReleasesBelowHero.slice(0, 6).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Grid>
          </ChartSection>
        )}

        {topBeats.length > 0 && (
          <ChartSection title="Trending Beats" more={{ href: "/discover?type=BEAT", label: "Browse" }}>
            <Grid>
              {topBeats.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Grid>
          </ChartSection>
        )}

        {upcomingEvents.length > 0 && (
          <ChartSection title="Trending Events" more={{ href: "/discover?type=EVENT", label: "See all" }}>
            <Grid>
              {upcomingEvents.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={{
                    id: ev.id,
                    creatorId: ev.creatorId,
                    title: ev.title,
                    coverImageLadder: ev.coverImageLadder,
                    startsAt: ev.startsAt,
                    tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
                  }}
                />
              ))}
            </Grid>
          </ChartSection>
        )}

        {merchItems.length > 0 && (
          <ChartSection title="Top Merch" more={{ href: "/discover?type=MERCH", label: "Shop all" }}>
            <Grid>
              {merchItems.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </Grid>
          </ChartSection>
        )}

        {creators.length > 0 && (
          <ChartSection title="Most Followed">
            <div className="flex gap-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {creators.map((c, i) => (
                <Link key={c.id} href={`/u/${c.handle}`} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
                  <Avatar url={c.avatarUrl} name={c.displayName} index={i} size="lg" />
                  <span className="line-clamp-1 text-center text-[11px] font-medium text-ink-2">{c.displayName}</span>
                  <span className="text-[10px] text-ink-3">{c._count.followers}</span>
                </Link>
              ))}
            </div>
          </ChartSection>
        )}
      </div>
    </OwnedBadgesProvider>
  );
}

function ChartSection({ title, sub, more, children }: { title: string; sub?: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between px-4">
        <div>
          <h2 className="font-serif text-2xl font-bold">{title}</h2>
          {sub && <p className="text-xs text-ink-3">{sub}</p>}
        </div>
        {more && (
          <Link href={more.href} className="text-xs font-semibold text-red-soft">
            {more.label} ›
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-3 px-4 md:grid-cols-5 md:px-6 xl:grid-cols-7">{children}</div>;
}

function Avatar({ url, name, index, size = "md" }: { url: string | null; name: string; index: number; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14" : "h-11 w-11";
  return (
    <span className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-gradient-to-br ${AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]}`}>
      <FallbackImg
        src={url}
        alt={name}
        className="h-full w-full object-cover"
        fallback={<span className="font-serif text-base text-white">{name.slice(0, 1).toUpperCase()}</span>}
      />
    </span>
  );
}
