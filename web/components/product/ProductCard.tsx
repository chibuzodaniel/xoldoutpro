"use client";

import Link from "next/link";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { SoldCount } from "@/components/product/SoldCount";
import { useOwnedProducts } from "@/components/product/OwnedBadges";
import { Price } from "@/components/currency/CurrencyProvider";

export type ProductCardData = {
  id: string;
  creatorId: string;
  // Prisma's ProductType includes EVENT too, but an EVENT-type Product (a
  // ticket tier) is never routed through this card — Discover/Library show
  // those via EventCard/EventTierPicker instead, keyed by Event.id.
  type: "RELEASE" | "BEAT" | "EVENT" | "MERCH";
  title: string;
  priceKobo: number;
  creator: { handle: string; displayName: string };
  release: { artworkLadder: unknown; releaseType: string } | null;
  beat: { coverImageLadder: unknown } | null;
  merchItem: { imageLadder: unknown } | null;
  stockPolicy: { cap: number | null; sold: number; soldOutAt: Date | null } | null;
  // Creative Add-ons on this item (Product.addOnCount) — drives the E+ badge.
  addOnCount?: number;
};

function ladderUrl(ladder: unknown, size: "64" | "256" | "1024") {
  return (ladder as Record<string, string> | undefined)?.[size];
}

// Each sellable type keeps its own detail route (/r, /b, /m) and its own
// image ladder field — this is the one place that difference is reconciled
// so every browsing surface can render any type through the same card.
function hrefFor(product: ProductCardData) {
  if (product.type === "BEAT") return `/b/${product.id}`;
  if (product.type === "MERCH") return `/m/${product.id}`;
  return `/r/${product.id}`;
}

function imageUrlFor(product: ProductCardData, size: "64" | "256" | "1024") {
  if (product.type === "BEAT") return ladderUrl(product.beat?.coverImageLadder, size);
  if (product.type === "MERCH") return ladderUrl(product.merchItem?.imageLadder, size);
  return ladderUrl(product.release?.artworkLadder, size);
}

function categoryLabelFor(product: ProductCardData) {
  if (product.type === "BEAT") return "Beat";
  if (product.type === "MERCH") return "Merch";
  const releaseType = product.release?.releaseType;
  if (!releaseType) return "Music";
  return releaseType.charAt(0) + releaseType.slice(1).toLowerCase();
}

// Single shared card for every browsing surface — PRD §6 requirement:
// price plus either sold count or remaining count, plus the sold-out state.
// A sold-out item is never hidden, only visually marked.
export function ProductCard({ product }: { product: ProductCardData }) {
  const owned = useOwnedProducts().has(product.id);
  const isSoldOut = Boolean(product.stockPolicy?.soldOutAt);
  const cap = product.stockPolicy?.cap ?? null;
  const sold = product.stockPolicy?.sold ?? 0;
  const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
  const imageUrl = imageUrlFor(product, "256");
  // E+ (explicit ask, 2026-10-21): this purchase comes with extra content.
  // Sits where the old play button was; music only for now.
  const hasExtras = product.type === "RELEASE" && (product.addOnCount ?? 0) > 0;

  return (
    <Link href={hrefFor(product)} className="block w-full group">
      <div className="aspect-square w-full rounded-lg bg-surface-2 overflow-hidden relative">
        {/* Already the right size (server-generated ladder rung, lib/images.ts) — `unoptimized`
            skips Vercel's Image Optimization pipeline, which would otherwise re-transform this
            one already-correct 256px image into up to 8 more deviceSizes variants per card. */}
        <ArtworkImage src={imageUrl} alt={product.title} sizes="33vw" unoptimized className="object-cover" />

        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 backdrop-blur-sm px-2 py-[3px] text-[10px] font-semibold uppercase tracking-wide text-white">
          {categoryLabelFor(product)}
        </span>

        {isSoldOut && (
          <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
            <span className="rounded-full border border-white/40 px-3 py-1 text-[11px] uppercase tracking-widest text-white font-semibold">
              Sold out
            </span>
          </div>
        )}

        {hasExtras && (
          <span
            title="Comes with extra content"
            className="absolute right-1.5 bottom-1.5 rounded-md bg-red px-1.5 py-[2px] text-[10px] font-bold leading-none text-white shadow-sm"
          >
            E+
          </span>
        )}

        {owned && !isSoldOut && (
          <span className={`absolute right-1.5 ${hasExtras ? "bottom-7" : "bottom-1.5"} rounded-full bg-black/55 backdrop-blur-sm px-1.5 py-[2px] text-[9px] font-semibold uppercase tracking-wide text-red-soft`}>
            Owned
          </span>
        )}
      </div>
      <p className="text-xs font-semibold mt-1.5 line-clamp-1">{product.title}</p>
      <p className="text-[12px] text-ink-3 line-clamp-1">{product.creator.displayName}</p>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[12px] font-serif"><Price kobo={product.priceKobo} freeLabel="Free" /></span>
        {remaining !== null ? (
          <span className="text-[12px] font-semibold text-red-soft">
            {isSoldOut ? "Sold out" : `${remaining} left`}
          </span>
        ) : (
          <SoldCount creatorId={product.creatorId} sold={sold} />
        )}
      </div>
    </Link>
  );
}
