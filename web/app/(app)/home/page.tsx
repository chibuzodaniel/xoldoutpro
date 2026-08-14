import Link from "next/link";
import { db } from "@/lib/db";
import { ProductCard } from "@/components/product/ProductCard";

// Stock counts and follower counts change on every purchase/follow — never
// prerender this statically at build time.
export const dynamic = "force-dynamic";

const cardInclude = {
  creator: { select: { handle: true, displayName: true } },
  release: { select: { artworkLadder: true } },
  stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
} as const;

export default async function HomePage() {
  const [newReleases, sellingOutNow, creators] = await Promise.all([
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
    db.user.findMany({
      orderBy: { followers: { _count: "desc" } },
      take: 8,
      select: { id: true, handle: true, displayName: true, avatarUrl: true, _count: { select: { followers: true } } },
    }),
  ]);

  const hero = newReleases[0];

  return (
    <div className="pb-8">
      {hero && (
        <Link href={`/r/${hero.id}`} className="block relative h-52 mb-5">
          <div className="absolute inset-0 bg-surface-2">
            {(hero.release?.artworkLadder as Record<string, string> | undefined)?.["1024"] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={(hero.release!.artworkLadder as Record<string, string>)["1024"]}
                alt={hero.title}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
          <div className="absolute left-4 right-4 bottom-4">
            <h2 className="font-serif text-xl text-white">{hero.title}</h2>
            <p className="text-xs text-white/70">{hero.creator.displayName}</p>
          </div>
        </Link>
      )}

      {sellingOutNow.length > 0 && (
        <section className="px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-base">Selling Out Now</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {sellingOutNow.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <section className="px-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-serif text-base">New Releases</h3>
        </div>
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

      {creators.length > 0 && (
        <section className="px-4">
          <h3 className="font-serif text-base mb-3">Creators</h3>
          <div className="flex gap-4 overflow-x-auto">
            {creators.map((c) => (
              <Link key={c.id} href={`/u/${c.handle}`} className="flex flex-col items-center gap-1 w-14 shrink-0">
                <div className="h-12 w-12 rounded-full bg-surface-2 border border-line overflow-hidden flex items-center justify-center">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt={c.displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-serif text-sm text-ink-3">{c.displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <span className="text-[10px] text-ink-2 line-clamp-1 text-center">{c.displayName}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
