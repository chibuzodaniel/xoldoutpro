"use client";

import { useState } from "react";
import Link from "next/link";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { useOwnedProducts } from "@/components/product/OwnedBadges";
import { usePlayer } from "@/components/player/PlayerProvider";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { useToast } from "@/components/ui/ToastProvider";

// v2 Discover feed card (design/v2-prototype): full-width artwork with the
// title over it, a short description, share, and the buy button. Every
// purchase still happens on the product page — the card only links there.

export type FeedCardProduct = {
  id: string;
  type: "RELEASE" | "BEAT" | "EVENT" | "MERCH";
  title: string;
  description: string;
  priceKobo: number;
  payWhatYouWant?: boolean;
  publishedAt: Date | string | null;
  creator: { handle: string; displayName: string };
  release: { artworkLadder: unknown; releaseType: string } | null;
  beat: { coverImageLadder: unknown } | null;
  merchItem: { imageLadder: unknown } | null;
  stockPolicy: { cap: number | null; sold: number; soldOutAt: Date | string | null } | null;
  addOnCount?: number;
  firstTrack: { id: string; title: string; lyricsText: string | null } | null;
  isVerified: boolean;
  verificationBadges: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function hrefFor(p: FeedCardProduct) {
  if (p.type === "BEAT") return `/b/${p.id}`;
  if (p.type === "MERCH") return `/m/${p.id}`;
  return `/r/${p.id}`;
}

function imageFor(p: FeedCardProduct) {
  const ladder = (p.type === "BEAT" ? p.beat?.coverImageLadder : p.type === "MERCH" ? p.merchItem?.imageLadder : p.release?.artworkLadder) as
    | Record<string, string>
    | undefined;
  return ladder?.["1024"] ?? ladder?.["256"] ?? null;
}

function kindLabel(p: FeedCardProduct, isNew: boolean) {
  if (p.type === "BEAT") return isNew ? "New beat" : "Beat";
  if (p.type === "MERCH") return "Merch";
  const t = p.release?.releaseType;
  const name = t === "EP" ? "EP" : t === "ALBUM" ? "album" : "single";
  return isNew ? `New ${name}` : name === "EP" ? "EP" : name.charAt(0).toUpperCase() + name.slice(1);
}

function daysAgo(publishedAt: FeedCardProduct["publishedAt"]) {
  if (!publishedAt) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(publishedAt).getTime()) / DAY_MS));
}

function blurbFor(p: FeedCardProduct, ago: number | null) {
  if (p.description.trim()) return p.description.trim();
  const what = p.type === "BEAT" ? "a beat" : p.type === "MERCH" ? "merch" : `a ${kindLabel(p, false).toLowerCase()}`;
  const when = ago === null ? "" : ago === 0 ? ", released today" : `, released ${ago} day${ago === 1 ? "" : "s"} ago`;
  const price = p.priceKobo === 0 ? "It's free." : `Price: ${naira(p.priceKobo)}${p.payWhatYouWant ? "+" : ""}.`;
  return `${p.title} is ${what} by ${p.creator.displayName}${when}. ${price}`;
}

export function FeedCard({ product: p, trending = false, priority = false }: { product: FeedCardProduct; trending?: boolean; priority?: boolean }) {
  const owned = useOwnedProducts().has(p.id);
  const player = usePlayer();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);

  const ago = daysAgo(p.publishedAt);
  const isNew = ago !== null && ago <= 7;
  const soldOut = Boolean(p.stockPolicy?.soldOutAt);
  const isFree = p.priceKobo === 0;
  const image = imageFor(p);
  const href = hrefFor(p);
  const canPlay = (p.type === "RELEASE" && p.firstTrack) || p.type === "BEAT";
  const isPlayingThis =
    player.isPlaying && (p.type === "BEAT" ? player.current?.trackId === p.id : player.current?.trackId === p.firstTrack?.id);
  const blurb = blurbFor(p, ago);

  function togglePlay() {
    if (isPlayingThis) return player.togglePlay();
    const common = { artistName: p.creator.displayName, artworkUrl: image, productId: p.id };
    if (p.type === "BEAT") player.play({ ...common, trackId: p.id, title: p.title, lyricsText: null, kind: "beat" });
    else if (p.firstTrack) player.play({ ...common, trackId: p.firstTrack.id, title: p.firstTrack.title, lyricsText: p.firstTrack.lyricsText });
  }

  async function share() {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) await navigator.share({ title: p.title, text: `${p.title} by ${p.creator.displayName} on XOLDOUT`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  }

  const badge = trending
    ? { label: "TRENDING", cls: "bg-red text-white", flame: true }
    : soldOut
      ? { label: "SOLD OUT", cls: "bg-black/70 text-white border border-white/15", flame: false }
      : isNew
        ? { label: "NEW", cls: "bg-black/60 text-white border border-white/10", flame: false }
        : isFree
          ? { label: "FREE", cls: "bg-black/60 text-white border border-white/10", flame: false }
          : null;

  return (
    <article className="overflow-hidden rounded-[28px] border border-line-soft bg-surface">
      <div className="relative aspect-[5/6] w-full bg-gradient-to-br from-red/50 via-red-tint to-black">
        <Link href={href} aria-label={p.title} className="absolute inset-0">
          <ArtworkImage src={image} alt={p.title} sizes="(max-width: 640px) 100vw, 480px" priority={priority} unoptimized className="object-cover" />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent" />
        {badge && (
          <span className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tracking-wide ${badge.cls}`}>
            {badge.flame && (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                <path d="M12 2s5 4.5 5 10a5 5 0 01-10 0c0-2 1-3.5 1-3.5S9 11 10.5 11C10.5 7 12 2 12 2z" />
              </svg>
            )}
            {badge.label}
          </span>
        )}
        {(p.addOnCount ?? 0) > 0 && (
          <span className="absolute right-4 top-4 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-red-soft">E+</span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-5 pb-5">
          <div className="min-w-0">
            <Link href={`/u/${p.creator.handle}`} className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-2">
              <span className="truncate">{p.creator.displayName}</span>
              {p.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" badgeType={primaryBadgeType(p.verificationBadges)} />}
            </Link>
            <Link href={href} className="mt-1 block font-serif text-[30px] font-bold leading-[1.05] line-clamp-2 [overflow-wrap:anywhere] min-[380px]:text-[34px]">
              {p.title}
            </Link>
            <p className="mt-1 text-[15px] text-ink-2">
              {kindLabel(p, isNew)} ·{" "}
              <span className="font-semibold text-red-soft">{isFree ? "Free" : `${naira(p.priceKobo)}${p.payWhatYouWant ? "+" : ""}`}</span>
            </p>
          </div>
          {canPlay && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlayingThis ? `Pause ${p.title}` : `Play a preview of ${p.title}`}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg"
            >
              {isPlayingThis ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-[1px]" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <p className={`text-[14px] leading-relaxed text-ink-3 ${expanded ? "" : "line-clamp-2"}`}>{blurb}</p>
        <div className="mt-2 flex items-center gap-5 text-[13px] font-semibold">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-red-soft">
            {expanded ? "See less" : "See more"}
          </button>
          <Link href={href} className="text-ink">
            See details
          </Link>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={share} aria-label={`Share ${p.title}`} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:text-ink">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="18" cy="5" r="2.6" />
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="19" r="2.6" />
              <path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
            </svg>
          </button>
          {owned ? (
            <Link href={href} className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-ink-3">
              Owned
            </Link>
          ) : soldOut ? (
            <span className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-ink-3">Sold out</span>
          ) : (
            <Link href={href} className="inline-flex items-center gap-2 rounded-full bg-red px-5 py-2.5 text-[15px] font-bold text-white">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 8h12l-1 12H7L6 8z" strokeLinejoin="round" />
                <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
              </svg>
              {isFree ? "Get Free" : "Buy Now"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
