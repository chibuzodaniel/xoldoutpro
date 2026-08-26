import Image from "next/image";
import Link from "next/link";

export type EntitlementCardData = {
  id: string;
  product: {
    id: string;
    title: string;
    creator: { displayName: string; handle: string };
    release: { artworkLadder: unknown } | null;
    beat: { coverImageLadder: unknown } | null;
    merchItem: { imageLadder: unknown } | null;
    ticketTier: { name: string; event: { title: string; coverImageLadder: unknown } } | null;
  };
};

function ladderUrl(ladder: unknown, size: "64" | "256" | "1024") {
  return (ladder as Record<string, string> | undefined)?.[size];
}

function hrefFor(product: EntitlementCardData["product"]) {
  if (product.beat) return `/b/${product.id}`;
  if (product.merchItem) return `/m/${product.id}`;
  if (product.ticketTier) return `/e/${product.id}`;
  return `/r/${product.id}`;
}

function imageUrlFor(product: EntitlementCardData["product"], size: "64" | "256" | "1024") {
  if (product.beat) return ladderUrl(product.beat.coverImageLadder, size);
  if (product.merchItem) return ladderUrl(product.merchItem.imageLadder, size);
  if (product.ticketTier) return ladderUrl(product.ticketTier.event.coverImageLadder, size);
  return ladderUrl(product.release?.artworkLadder, size);
}

function subtitleFor(product: EntitlementCardData["product"]) {
  if (product.ticketTier) return product.ticketTier.event.title;
  return product.creator.displayName;
}

// Shared card for "things this account owns," rendered in a grid — used by
// Collections and the Gifts tab. Links straight to the product's own detail
// page rather than reimplementing playback/download/QR inline, which Library
// already owns per-type.
export function EntitlementCard({ entitlement }: { entitlement: EntitlementCardData }) {
  const { product } = entitlement;
  const imageUrl = imageUrlFor(product, "256");

  return (
    <Link href={hrefFor(product)} className="block w-full">
      <div className="relative aspect-square w-full rounded-lg bg-surface-2 overflow-hidden">
        {/* Already a ladder rung (lib/images.ts) — see ProductCard for why `unoptimized`. */}
        {imageUrl && <Image src={imageUrl} alt={product.title} fill sizes="33vw" unoptimized className="object-cover" />}
      </div>
      <p className="text-xs font-semibold mt-1.5 line-clamp-1">{product.title}</p>
      <p className="text-[12px] text-ink-3 line-clamp-1">{subtitleFor(product)}</p>
    </Link>
  );
}
