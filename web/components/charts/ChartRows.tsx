"use client";

import Link from "next/link";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { useOwnedProducts } from "@/components/product/OwnedBadges";
import { usePlayer } from "@/components/player/PlayerProvider";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { FollowButton } from "@/components/profile/FollowButton";
import { useToast } from "@/components/ui/ToastProvider";
import type { FeedCardProduct } from "@/components/discover/FeedCard";

// Charts rows (design/v2-prototype, 2026-11-09): big red rank, movement
// (NEW / ↑n / ↓n), artwork, title, artist, a stats line, and the actions.
// Buying still happens on the product page — Buy only links there.

type Movement = { kind: "new" } | { kind: "up" | "down"; by: number } | { kind: "same" } | null;

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function Rank({ rank, movement }: { rank: number; movement: Movement }) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-1">
      <span className={`font-serif text-[30px] font-bold leading-none ${rank <= 3 ? "text-red-soft" : "text-ink"}`}>{rank}</span>
      {movement?.kind === "new" && <span className="rounded bg-red px-1.5 py-0.5 text-[9px] font-extrabold text-white">NEW</span>}
      {movement?.kind === "up" && <span className="text-[11px] font-semibold text-green">↑{movement.by}</span>}
      {movement?.kind === "down" && <span className="text-[11px] font-semibold text-ink-3">↓{movement.by}</span>}
    </div>
  );
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
  return ladder?.["256"] ?? ladder?.["1024"] ?? null;
}

// Compact so every action fits on one line under the row (design/v2-prototype);
// two-word labels may wrap inside their pill.
const pill = "flex min-h-[40px] max-w-[88px] items-center justify-center rounded-full border border-line px-3 py-1 text-center text-[12.5px] font-semibold leading-tight text-ink";

export function ProductChartRow({
  rank,
  movement,
  product: p,
  stats,
}: {
  rank: number;
  movement: Movement;
  product: FeedCardProduct;
  stats: string;
}) {
  const owned = useOwnedProducts().has(p.id);
  const player = usePlayer();
  const toast = useToast();
  const href = hrefFor(p);
  const image = imageFor(p);
  const soldOut = Boolean(p.stockPolicy?.soldOutAt);
  const canPreview = (p.type === "RELEASE" && p.firstTrack) || p.type === "BEAT";

  function preview() {
    const common = { artistName: p.creator.displayName, artworkUrl: image, productId: p.id };
    if (p.type === "BEAT") player.play({ ...common, trackId: p.id, title: p.title, lyricsText: null, kind: "beat" });
    else if (p.firstTrack) player.play({ ...common, trackId: p.firstTrack.id, title: p.firstTrack.title, lyricsText: p.firstTrack.lyricsText });
  }

  async function share() {
    const url = `${window.location.origin}${href}`;
    try {
      if (navigator.share) await navigator.share({ title: p.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // dismissed
    }
  }

  return (
    <li className="flex gap-3 border-b border-line-soft py-4">
      <Rank rank={rank} movement={movement} />
      <div className="min-w-0 flex-1">
        <div className="flex gap-3">
          <Link href={href} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-red/50 to-black">
            <ArtworkImage src={image} alt={p.title} sizes="64px" unoptimized className="object-cover" />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={href} className="block truncate text-[16px] font-bold">
              {p.title}
            </Link>
            <Link href={`/u/${p.creator.handle}`} className="flex items-center gap-1 text-[14px] text-ink-2">
              <span className="truncate">{p.creator.displayName}</span>
              {p.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" badgeType={primaryBadgeType(p.verificationBadges)} />}
            </Link>
            <p className="truncate text-[12px] text-ink-3">
              {stats} · <span className="text-red-soft">{p.priceKobo === 0 ? "Free" : `${naira(p.priceKobo)}${p.payWhatYouWant ? "+" : ""}`}</span>
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-nowrap items-center justify-start gap-2">
          {canPreview && (
            <button type="button" onClick={preview} className={`${pill} gap-1.5`}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M7 5v14l11-7z" strokeLinejoin="round" />
              </svg>
              Preview
            </button>
          )}
          <Link href={href} className={pill}>
            See details
          </Link>
          <button type="button" onClick={share} aria-label={`Share ${p.title}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="18" cy="5" r="2.6" />
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="19" r="2.6" />
              <path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
            </svg>
          </button>
          {owned ? (
            <Link href={href} className={`${pill} text-ink-3`}>
              Owned
            </Link>
          ) : soldOut ? (
            <span className={`${pill} text-ink-3`}>Sold out</span>
          ) : (
            <Link href={href} className="flex min-h-[40px] max-w-[88px] items-center justify-center rounded-full bg-red px-3.5 py-1 text-center text-[12.5px] font-bold leading-tight text-white">
              {p.priceKobo === 0 ? "Get Free" : p.type === "MERCH" ? "Purchase" : "Buy Now"}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export function CreatorChartRow({
  rank,
  movement,
  creator: c,
  stats,
}: {
  rank: number;
  movement: Movement;
  creator: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean; verificationBadges: string[]; followers: number };
  stats: string;
}) {
  return (
    <li className="flex gap-3 border-b border-line-soft py-4">
      <Rank rank={rank} movement={movement} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <Link href={`/u/${c.handle}`} className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-red/50 to-black">
            <FallbackImg
              src={c.avatarUrl}
              alt={c.displayName}
              className="h-full w-full object-cover"
              fallback={<span className="flex h-full w-full items-center justify-center font-serif text-xl text-white">{c.displayName.slice(0, 1).toUpperCase()}</span>}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={`/u/${c.handle}`} className="flex items-center gap-1 text-[16px] font-bold">
              <span className="truncate">{c.displayName}</span>
              {c.isVerified && <VerifiedBadge className="h-4 w-4 shrink-0" badgeType={primaryBadgeType(c.verificationBadges)} />}
            </Link>
            <p className="text-[13px] text-ink-2">{c.followers.toLocaleString("en-NG")} followers</p>
            <p className="truncate text-[12px] text-ink-3">{stats}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-start gap-2">
          <Link href={`/u/${c.handle}`} className={pill}>
            Visit profile
          </Link>
          <FollowButton targetUserId={c.id} />
        </div>
      </div>
    </li>
  );
}
