import Link from "next/link";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { CountryFlag } from "@/components/profile/CountryFlag";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";

// v2 Discover feed card for an event (design/v2-prototype). Tickets are
// bought on the event page — this only links there.

export type EventFeedCardData = {
  id: string;
  title: string;
  description: string;
  startsAt: Date | string;
  venue: string | null;
  isVirtual: boolean;
  coverImageLadder: unknown;
  // Started already (getEventFeed works this out) — shows HAPPENING NOW.
  isLive: boolean;
  creator: { handle: string; displayName: string; isVerified: boolean; verificationBadges: string[]; countryCode?: string | null };
  tiers: { product: { priceKobo: number; stockPolicy: { cap: number | null; sold: number; soldOutAt: Date | string | null } | null } }[];
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export function EventFeedCard({ event: ev }: { event: EventFeedCardData }) {
  const ladder = ev.coverImageLadder as Record<string, string> | null;
  const image = ladder?.["1024"] ?? ladder?.["256"] ?? null;
  const starts = new Date(ev.startsAt);
  const prices = ev.tiers.map((t) => t.product.priceKobo);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const soldOut = ev.tiers.length > 0 && ev.tiers.every((t) => t.product.stockPolicy?.soldOutAt);
  const live = ev.isLive;
  const where = ev.isVirtual ? "Virtual" : (ev.venue ?? "Venue TBA");

  return (
    <article className="overflow-hidden rounded-[28px] border border-line-soft bg-surface">
      <Link href={`/e/${ev.id}`} className="relative block aspect-[5/6] w-full bg-gradient-to-br from-red/50 via-red-tint to-black">
        <ArtworkImage src={image} alt={ev.title} sizes="(max-width: 640px) 100vw, 480px" unoptimized className="object-cover" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent" />
        <span
          className={`absolute left-4 top-4 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tracking-wide ${
            live ? "bg-red text-white" : "border border-white/10 bg-black/60 text-white"
          }`}
        >
          {live ? "HAPPENING NOW" : starts.toLocaleDateString("en-NG", { day: "numeric", month: "short" }).toUpperCase()}
        </span>
        <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-2">
            <span className="truncate">{ev.creator.displayName}</span>
            {ev.creator.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" badgeType={primaryBadgeType(ev.creator.verificationBadges)} />}
            <CountryFlag code={ev.creator.countryCode} />
          </span>
          <span className="mt-1 block font-serif text-[34px] font-bold leading-[1.05] line-clamp-2">{ev.title}</span>
          <span className="mt-1 block text-[15px] text-ink-2">
            {starts.toLocaleString("en-NG", { weekday: "short", hour: "numeric", minute: "2-digit" })} · {where}
          </span>
        </div>
      </Link>
      <div className="px-5 pb-5 pt-4">
        {ev.description.trim() && <p className="text-[14px] leading-relaxed text-ink-3 line-clamp-2">{ev.description.trim()}</p>}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[15px] font-semibold">
            {prices.length === 0 ? "" : minPrice === 0 ? <span className="text-red-soft">Free</span> : <>From <span className="text-red-soft">{naira(minPrice)}</span></>}
          </span>
          {soldOut ? (
            <span className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-ink-3">Sold out</span>
          ) : (
            <Link href={`/e/${ev.id}`} className="rounded-full bg-red px-5 py-2.5 text-[15px] font-bold text-white">
              Get tickets
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
