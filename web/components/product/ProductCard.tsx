import Link from "next/link";

export type ProductCardData = {
  id: string;
  title: string;
  priceKobo: number;
  creator: { handle: string; displayName: string };
  release: { artworkLadder: unknown; releaseType: string } | null;
  stockPolicy: { cap: number | null; sold: number; soldOutAt: Date | null } | null;
};

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function artworkUrl(release: ProductCardData["release"], size: "64" | "256" | "1024") {
  const ladder = release?.artworkLadder as Record<string, string> | undefined;
  return ladder?.[size];
}

function categoryLabel(releaseType: string | undefined) {
  if (!releaseType) return "Music";
  return releaseType.charAt(0) + releaseType.slice(1).toLowerCase();
}

// Single shared card for every browsing surface — PRD §6 requirement:
// price plus either sold count or remaining count, plus the sold-out state.
// A sold-out item is never hidden, only visually marked.
export function ProductCard({ product }: { product: ProductCardData }) {
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;

  return (
    <Link href={`/r/${product.id}`} className="block w-full group">
      <div className="aspect-square w-full rounded-lg bg-surface-2 overflow-hidden relative">
        {artworkUrl(product.release, "256") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artworkUrl(product.release, "256")} alt={product.title} className="h-full w-full object-cover" />
        )}

        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 backdrop-blur-sm px-2 py-[3px] text-[9px] font-semibold uppercase tracking-wide text-white">
          {categoryLabel(product.release?.releaseType)}
        </span>

        {!isSoldOut && (
          <span className="absolute right-1.5 bottom-1.5 h-6 w-6 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        )}

        {isSoldOut && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="rounded-full border border-white/40 px-3 py-1 text-[10px] uppercase tracking-widest text-white font-semibold">
              Sold out
            </span>
          </div>
        )}
      </div>
      <p className="text-xs font-semibold mt-1.5 line-clamp-1">{product.title}</p>
      <p className="text-[11px] text-ink-3 line-clamp-1">{product.creator.displayName}</p>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[11px] font-serif">{formatNaira(product.priceKobo)}</span>
        {remaining !== null ? (
          <span className="text-[11px] font-semibold text-red-soft">
            {isSoldOut ? "Sold out" : `${remaining} left`}
          </span>
        ) : (
          <span className="text-[11px] text-ink-3">{sold} sold</span>
        )}
      </div>
    </Link>
  );
}
