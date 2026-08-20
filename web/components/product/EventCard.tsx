import Image from "next/image";
import Link from "next/link";

export type EventCardData = {
  id: string;
  title: string;
  coverImageLadder: unknown;
  startsAt: Date;
  tiers: { priceKobo: number; stockPolicy: { cap: number | null; sold: number; soldOutAt: Date | null } | null }[];
};

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

// Events group multiple independently-priced/capped ticket tiers (each its
// own Product — DECISIONS.md), so this card shows the cheapest tier's price
// and sold-across-all-tiers, unlike ProductCard which has one price per item.
export function EventCard({ event }: { event: EventCardData }) {
  const cover = (event.coverImageLadder as Record<string, string> | undefined)?.["256"];
  const minPriceKobo = Math.min(...event.tiers.map((t) => t.priceKobo));
  const totalSold = event.tiers.reduce((sum, t) => sum + (t.stockPolicy?.sold ?? 0), 0);
  const allSoldOut = event.tiers.length > 0 && event.tiers.every((t) => Boolean(t.stockPolicy?.soldOutAt));

  return (
    <Link href={`/e/${event.id}`} className="block w-full group">
      <div className="aspect-square w-full rounded-lg bg-surface-2 overflow-hidden relative">
        {cover && <Image src={cover} alt={event.title} fill sizes="33vw" className="object-cover" />}

        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 backdrop-blur-sm px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wide text-white">
          {formatDate(event.startsAt)}
        </span>

        {allSoldOut && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="rounded-full border border-white/40 px-3 py-1 text-[11px] uppercase tracking-widest text-white font-semibold">
              Sold out
            </span>
          </div>
        )}
      </div>
      <p className="text-xs font-semibold mt-1.5 line-clamp-1">{event.title}</p>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[12px] font-serif">
          {minPriceKobo === 0 ? "Free" : `From ${formatNaira(minPriceKobo)}`}
        </span>
        <span className="text-[12px] text-ink-3">{allSoldOut ? "Sold out" : `${totalSold} sold`}</span>
      </div>
    </Link>
  );
}
