import Link from "next/link";
import { db } from "@/lib/db";
import { ProductCard } from "@/components/product/ProductCard";
import { EventCard } from "@/components/product/EventCard";
import { AppHeader } from "@/components/nav/AppHeader";
import { CategoryTabs, type CategoryType } from "@/components/nav/CategoryTabs";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";

// Stock/follower counts change often, but not so often that every single
// pageview needs to hit the DB — cache briefly and revalidate in the
// background instead of forcing a fresh render every time.
export const revalidate = 20;

const cardInclude = {
  creator: { select: { handle: true, displayName: true } },
  release: { select: { artworkLadder: true, releaseType: true } },
  beat: { select: { coverImageLadder: true } },
  merchItem: { select: { imageLadder: true } },
  stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
} as const;

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

const VALID_TYPES = ["RELEASE", "BEAT", "EVENT", "MERCH"] as const;
const SECTION_TITLE: Record<(typeof VALID_TYPES)[number], string> = {
  RELEASE: "Music",
  BEAT: "Beats",
  EVENT: "Events",
  MERCH: "Merchandise",
};

export default async function DiscoverPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const activeType = (VALID_TYPES as readonly string[]).includes(type ?? "") ? (type as CategoryType) : null;

  if (activeType === "EVENT") {
    const events = await db.event.findMany({
      where: { status: "PUBLISHED" },
      include: { tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } } },
      orderBy: { startsAt: "asc" },
      take: 60,
    });
    return (
      <div className="pb-8">
        <AppHeader />
        <CategoryTabs active={activeType} />
        <section className="px-4">
          <h3 className="font-serif text-lg mb-3">{SECTION_TITLE.EVENT}</h3>
          {events.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing published yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {events.map((ev) => (
                <EventCard
                  key={ev.id}
                  event={{
                    id: ev.id,
                    title: ev.title,
                    coverImageLadder: ev.coverImageLadder,
                    startsAt: ev.startsAt,
                    tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (activeType) {
    const products = await db.product.findMany({
      where: { type: activeType, status: "PUBLISHED" },
      include: cardInclude,
      orderBy: { publishedAt: "desc" },
      take: 60,
    });
    return (
      <div className="pb-8">
        <AppHeader />
        <CategoryTabs active={activeType} />
        <section className="px-4">
          <h3 className="font-serif text-lg mb-3">{SECTION_TITLE[activeType]}</h3>
          {products.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing published yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  const [newReleases, sellingOutNow, topBeats, upcomingEvents, merchItems, creators] = await Promise.all([
    db.product.findMany({
      where: { type: "RELEASE", status: "PUBLISHED" },
      include: cardInclude,
      orderBy: { publishedAt: "desc" },
      take: 12,
    }),
    db.product.findMany({
      where: {
        type: "RELEASE",
        status: "PUBLISHED",
        stockPolicy: { cap: { not: null }, soldOutAt: null },
      },
      include: cardInclude,
      orderBy: { stockPolicy: { sold: "desc" } },
      take: 12,
    }),
    db.product.findMany({
      where: { type: "BEAT", status: "PUBLISHED" },
      include: cardInclude,
      orderBy: { publishedAt: "desc" },
      take: 6,
    }),
    db.event.findMany({
      where: { status: "PUBLISHED", startsAt: { gte: new Date() } },
      include: { tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } } },
      orderBy: { startsAt: "asc" },
      take: 6,
    }),
    db.product.findMany({
      where: { type: "MERCH", status: "PUBLISHED" },
      include: cardInclude,
      orderBy: { publishedAt: "desc" },
      take: 6,
    }),
    db.user.findMany({
      orderBy: { followers: { _count: "desc" } },
      take: 8,
      select: { id: true, handle: true, displayName: true, avatarUrl: true, _count: { select: { followers: true } } },
    }),
  ]);

  const hero = newReleases[0];
  const heroArt = hero ? ((hero.release?.artworkLadder as Record<string, string> | undefined)?.["1024"]) : null;
  const heroSoldOut = Boolean(hero?.stockPolicy?.soldOutAt);
  const heroCap = hero?.stockPolicy?.cap ?? null;
  const heroSold = hero?.stockPolicy?.sold ?? 0;
  const heroRemaining = heroCap !== null ? Math.max(heroCap - heroSold, 0) : null;

  return (
    <div className="pb-8">
      <AppHeader />
      <CategoryTabs active={null} />

      {hero && (
        <Link href={`/r/${hero.id}`} className="block relative mx-4 mb-6 rounded-xl overflow-hidden aspect-[4/5]">
          <div className="absolute inset-0 bg-surface-2">
            {heroArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroArt} alt={hero.title} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/40" />

          <span className="absolute left-3 top-3 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-white">
            {(hero.release?.releaseType ?? "single").toLowerCase()}
          </span>
          <span className="absolute left-3 top-10 rounded-full bg-red px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-white">
            New Release
          </span>

          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-14 w-14 rounded-full bg-black/45 backdrop-blur-sm border border-white/25 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white translate-x-[1px]">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>

          <div className="absolute left-4 right-4 bottom-4">
            <p className="text-[11px] text-white/60 uppercase tracking-wide mb-1">{hero.creator.displayName}</p>
            <h2 className="font-serif text-2xl text-white leading-tight mb-2">{hero.title}</h2>
            <div className="flex items-center justify-between">
              {heroRemaining !== null ? (
                <span className="text-xs font-semibold text-red-soft">
                  {heroSoldOut ? "Sold out" : `${heroRemaining} of ${heroCap} left`}
                </span>
              ) : (
                <span className="text-xs text-white/60">{heroSold} sold</span>
              )}
              <span className="font-serif text-lg text-white">{formatNaira(hero.priceKobo)}</span>
            </div>
          </div>
        </Link>
      )}

      {sellingOutNow.length > 0 && (
        <section className="px-4 mb-7">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-red-soft mb-3">Selling Out Now</h3>
          <div className="grid grid-cols-3 gap-3">
            {sellingOutNow.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <section className="px-4 mb-7">
        <h3 className="font-serif text-lg mb-3">Recommended For You</h3>
        {newReleases.length === 0 ? (
          <p className="text-sm text-ink-3">Nothing published yet.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {newReleases.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {topBeats.length > 0 && (
        <section className="px-4 mb-7">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg">Beat Store</h3>
            <Link href="/discover?type=BEAT" className="text-xs text-red-soft font-semibold">
              Browse ›
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {topBeats.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {upcomingEvents.length > 0 && (
        <section className="px-4 mb-7">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg">Events</h3>
            <Link href="/discover?type=EVENT" className="text-xs text-red-soft font-semibold">
              See all ›
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {upcomingEvents.map((ev) => (
              <EventCard
                key={ev.id}
                event={{
                  id: ev.id,
                  title: ev.title,
                  coverImageLadder: ev.coverImageLadder,
                  startsAt: ev.startsAt,
                  tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
                }}
              />
            ))}
          </div>
        </section>
      )}

      {merchItems.length > 0 && (
        <section className="px-4 mb-7">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg">Merchandise</h3>
            <Link href="/discover?type=MERCH" className="text-xs text-red-soft font-semibold">
              Shop all ›
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {merchItems.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {creators.length > 0 && (
        <section className="px-4">
          <h3 className="font-serif text-lg mb-3">Featured Creators</h3>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {creators.map((c, i) => (
              <Link key={c.id} href={`/u/${c.handle}`} className="flex flex-col items-center gap-1.5 w-16 shrink-0">
                <div
                  className={`h-14 w-14 rounded-full overflow-hidden flex items-center justify-center border border-white/10 bg-gradient-to-br ${
                    AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]
                  }`}
                >
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt={c.displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-serif text-base text-white">{c.displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-[10.5px] font-medium text-ink-2 line-clamp-1 text-center">{c.displayName}</span>
                <span className="text-[9px] text-ink-3">{c._count.followers}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
