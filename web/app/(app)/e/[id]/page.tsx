import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EventTierPicker } from "@/components/product/EventTierPicker";
import { ProductHero, HeroMeta, HeroDescription } from "@/components/product/detail/ProductHero";
import { SoldCount } from "@/components/product/SoldCount";
import { EventPromotersPanel } from "@/components/product/EventPromotersPanel";
import { buildOgMetadata } from "@/lib/og";
import { Price } from "@/components/currency/CurrencyProvider";

// Public product data — cache and revalidate in the background instead of
// hitting the DB on every view.
export const revalidate = 120;

function formatDate(d: Date) {
  return d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    select: { title: true, description: true, coverImageLadder: true, venue: true, isVirtual: true, creator: { select: { displayName: true } } },
  });
  if (!event) return {};
  const cover = (event.coverImageLadder as Record<string, string> | null)?.["1024"] ?? null;
  return buildOgMetadata({
    title: `${event.title} — ${event.creator.displayName}`,
    description: event.description || `${event.title} · ${event.isVirtual ? "Virtual event" : event.venue ?? "Live event"} on XOLDOUT.`,
    imageUrl: cover,
    path: `/e/${id}`,
  });
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true, isVerified: true, verificationBadges: true } },
      tiers: { include: { product: { include: { stockPolicy: true } } }, orderBy: { order: "asc" } },
    },
  });

  if (!event || event.status === "DELETED") notFound();

  const cover = (event.coverImageLadder as Record<string, string>)["1024"];

  // A deleted tier (permanent) or a paused one (creator-toggled, reversible —
  // see app/api/events/[id]/tiers/[tierId]'s PATCH) is off sale: skip it here.
  // Owned tickets from either state still show in the buyer's Library.
  const visibleTiers = event.tiers.filter((t) => t.product.status === "PUBLISHED" && !t.pausedAt);

  // v2 product page (design/v2-prototype): shared ProductHero on top; the
  // ticket picker and promoter panel below are the same components as before.
  return (
    <ProductHero
      image={cover}
      aspect="aspect-[4/3]"
      chip="Event"
      title={event.title}
      creator={{ ...event.creator, verificationBadges: event.creator.verificationBadges as string[] }}
      creatorId={event.creatorId}
      share={{ path: `/e/${event.id}`, text: `${event.title} — ${event.creator.displayName} on XOLDOUT`, chatShare: { type: "EVENT", id: event.id } }}
      report={{ targetType: "EVENT", targetId: event.id }}
    >
        <HeroMeta parts={[`${formatDate(event.startsAt)} · ${formatTime(event.startsAt)}`]} />
        <HeroMeta parts={[event.isVirtual ? "Virtual event" : (event.venue ?? "Venue TBA")]} />
        <HeroDescription text={event.description} />

        <h2 className="mt-7 mb-3 font-serif text-2xl font-bold">Tickets</h2>
        <div className="flex flex-col gap-2.5 mb-6">
          {visibleTiers.map((tier) => {
            const isSoldOut = Boolean(tier.product.stockPolicy?.soldOutAt);
            const cap = tier.product.stockPolicy?.cap ?? null;
            const sold = tier.product.stockPolicy?.sold ?? 0;
            const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
            return (
              <div key={tier.productId} className="rounded-2xl border border-line bg-surface px-4 py-3.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[15px] font-semibold">{tier.name}</span>
                  <span className="font-serif text-xl font-bold text-red-soft"><Price kobo={tier.product.priceKobo} freeLabel="Free" /></span>
                </div>
                <span className="text-xs text-ink-3">
                  {isSoldOut ? (
                    "Sold out"
                  ) : remaining !== null ? (
                    `${remaining} of ${cap} left`
                  ) : (
                    <SoldCount creatorId={event.creatorId} sold={sold} />
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <EventTierPicker
          eventId={event.id}
          tiers={visibleTiers.map((t) => ({
            productId: t.productId,
            name: t.name,
            priceKobo: t.product.priceKobo,
            isSoldOut: Boolean(t.product.stockPolicy?.soldOutAt),
          }))}
        />

        <EventPromotersPanel eventId={event.id} eventTitle={event.title} creatorId={event.creatorId} />
    </ProductHero>
  );
}
