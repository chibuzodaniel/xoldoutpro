import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EventTierPicker } from "@/components/product/EventTierPicker";
import { ReportButton } from "@/components/trust/ReportButton";
import { ShareButton } from "@/components/ui/ShareButton";

// Public product data — cache and revalidate in the background instead of
// hitting the DB on every view.
export const revalidate = 30;

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await db.event.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true } },
      tiers: { include: { product: { include: { stockPolicy: true } } }, orderBy: { order: "asc" } },
    },
  });

  if (!event || event.status === "DELETED") notFound();

  const cover = (event.coverImageLadder as Record<string, string>)["1024"];

  return (
    <div className="pb-10">
      <div className="relative aspect-[4/3] w-full bg-surface-2">
        {cover && <Image src={cover} alt={event.title} fill sizes="100vw" priority className="object-cover" />}
      </div>

      <div className="px-4 pt-4">
        <span className="inline-block rounded-full bg-red/10 text-red-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide mb-2">
          Event
        </span>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">{event.title}</h1>
            <Link href={`/u/${event.creator.handle}`} className="text-sm text-ink-3">
              {event.creator.displayName}
            </Link>
          </div>
          <div className="flex items-center gap-3 shrink-0 pt-1">
            <ShareButton title={event.title} text={`${event.title} — ${event.creator.displayName} on XOLDOUT`} path={`/e/${event.id}`} />
            <ReportButton targetType="EVENT" targetId={event.id} ownerId={event.creatorId} className="text-xs text-ink-3" />
          </div>
        </div>

        <div className="flex flex-col gap-1 mt-3 mb-4 text-sm text-ink-2">
          <span>
            {formatDate(event.startsAt)} · {formatTime(event.startsAt)}
          </span>
          <span>{event.isVirtual ? "Virtual event" : event.venue ?? "Venue TBA"}</span>
        </div>

        {event.description && <p className="text-sm text-ink-2 mb-5">{event.description}</p>}

        <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-2">Tickets</h2>
        <div className="flex flex-col gap-2 mb-6">
          {event.tiers.map((tier) => {
            const isSoldOut = Boolean(tier.product.stockPolicy?.soldOutAt);
            const cap = tier.product.stockPolicy?.cap ?? null;
            const sold = tier.product.stockPolicy?.sold ?? 0;
            const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
            return (
              <div key={tier.productId} className="rounded-lg border border-line bg-surface px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{tier.name}</span>
                  <span className="font-serif text-sm">{formatNaira(tier.product.priceKobo)}</span>
                </div>
                <span className="text-xs text-ink-3">
                  {isSoldOut ? "Sold out" : remaining !== null ? `${remaining} of ${cap} left` : `${sold} sold`}
                </span>
              </div>
            );
          })}
        </div>

        <EventTierPicker
          eventId={event.id}
          tiers={event.tiers.map((t) => ({
            productId: t.productId,
            name: t.name,
            priceKobo: t.product.priceKobo,
            isSoldOut: Boolean(t.product.stockPolicy?.soldOutAt),
          }))}
        />
      </div>
    </div>
  );
}
