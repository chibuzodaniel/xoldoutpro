"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import {
  useOwnedProducts,
  useLikedProducts,
} from "@/components/product/OwnedBadges";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { usePlayer } from "@/components/player/PlayerProvider";
import {
  VerifiedBadge,
  primaryBadgeType,
} from "@/components/profile/VerifiedBadge";
import { useToast } from "@/components/ui/ToastProvider";
import { FeedCommentsSheet } from "@/components/discover/FeedCommentsSheet";
import { FeedCardMenu } from "@/components/discover/FeedCardMenu";
import { ProductShareSheet } from "@/components/product/ProductShareSheet";
import { PlayProgressRing } from "@/components/player/PlayProgressRing";
import { CountryFlag } from "@/components/profile/CountryFlag";
import { useHiddenItems } from "@/lib/hiddenItems";

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
  creatorId?: string;
  creator: { handle: string; displayName: string; countryCode?: string | null };
  release: { artworkLadder: unknown; releaseType: string } | null;
  beat: { coverImageLadder: unknown; genre?: string | null; bpm?: number | null } | null;
  merchItem: { imageLadder: unknown } | null;
  stockPolicy: {
    cap: number | null;
    sold: number;
    soldOutAt: Date | string | null;
  } | null;
  addOnCount?: number;
  firstTrack: { id: string; title: string; lyricsText: string | null } | null;
  // Feed-card social counts (v2): likes (Product.likeCount) and song comments.
  likeCount?: number;
  commentCount?: number;
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
  const ladder = (
    p.type === "BEAT"
      ? p.beat?.coverImageLadder
      : p.type === "MERCH"
        ? p.merchItem?.imageLadder
        : p.release?.artworkLadder
  ) as Record<string, string> | undefined;
  return ladder?.["1024"] ?? ladder?.["256"] ?? null;
}

function kindLabel(p: FeedCardProduct, isNew: boolean) {
  if (p.type === "BEAT") return isNew ? "New beat" : "Beat";
  if (p.type === "MERCH") return "Merch";
  const t = p.release?.releaseType;
  const name = t === "EP" ? "EP" : t === "ALBUM" ? "album" : "single";
  return isNew
    ? `New ${name}`
    : name === "EP"
      ? "EP"
      : name.charAt(0).toUpperCase() + name.slice(1);
}

function daysAgo(publishedAt: FeedCardProduct["publishedAt"]) {
  if (!publishedAt) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(publishedAt).getTime()) / DAY_MS),
  );
}

function blurbFor(p: FeedCardProduct, ago: number | null) {
  if (p.description.trim()) return p.description.trim();
  const what =
    p.type === "BEAT"
      ? "a beat"
      : p.type === "MERCH"
        ? "merch"
        : `a ${kindLabel(p, false).toLowerCase()}`;
  const when =
    ago === null
      ? ""
      : ago === 0
        ? ", released today"
        : `, released ${ago} day${ago === 1 ? "" : "s"} ago`;
  const price =
    p.priceKobo === 0
      ? "It's free."
      : `Price: ${naira(p.priceKobo)}${p.payWhatYouWant ? "+" : ""}.`;
  return `${p.title} is ${what} by ${p.creator.displayName}${when}. ${price}`;
}

export function FeedCard({
  product: p,
  trending = false,
  priority = false,
  compact = false,
}: {
  product: FeedCardProduct;
  trending?: boolean;
  priority?: boolean;
  /** Beats feed: artwork on the left, Preview + Buy Now below (design/v2-prototype). */
  compact?: boolean;
}) {
  const owned = useOwnedProducts().has(p.id);
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const { liked: likedSet, setLiked } = useLikedProducts();
  const liked = likedSet.has(p.id);
  // Shown count follows the viewer's own taps immediately (server count +/- the change).
  const [likeDelta, setLikeDelta] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  async function toggleLike() {
    if (!firebaseUser) return router.push("/login");
    const next = !liked;
    setLiked(p.id, next);
    setLikeDelta((d) => d + (next ? 1 : -1));
    const res = await apiFetch(`/api/products/${p.id}/like`, {
      method: "POST",
      body: JSON.stringify({ liked: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      // Put it back if the server didn't take it.
      setLiked(p.id, !next);
      setLikeDelta((d) => d - (next ? 1 : -1));
      toast.error("Couldn't update your like");
    }
  }
  const player = usePlayer();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsAdded, setCommentsAdded] = useState(0);
  const closeComments = useCallback(() => setCommentsOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const hidden = useHiddenItems().includes(p.id);
  // What the comments hang off: a release's first song, the beat, or (merch/events) the product.
  const commentTarget =
    p.type === "BEAT"
      ? { kind: "beat" as const, id: p.id }
      : p.type === "RELEASE"
        ? p.firstTrack
          ? { kind: "track" as const, id: p.firstTrack.id }
          : null
        : { kind: "product" as const, id: p.id };

  const ago = daysAgo(p.publishedAt);
  const isNew = ago !== null && ago <= 7;
  const soldOut = Boolean(p.stockPolicy?.soldOutAt);
  const isFree = p.priceKobo === 0;
  const image = imageFor(p);
  const href = hrefFor(p);
  const canPlay = (p.type === "RELEASE" && p.firstTrack) || p.type === "BEAT";
  const isPlayingThis =
    player.isPlaying &&
    (p.type === "BEAT"
      ? player.current?.trackId === p.id
      : player.current?.trackId === p.firstTrack?.id);
  const blurb = blurbFor(p, ago);

  function togglePlay() {
    if (isPlayingThis) return player.togglePlay();
    const common = {
      artistName: p.creator.displayName,
      artworkUrl: image,
      productId: p.id,
    };
    if (p.type === "BEAT")
      player.play({
        ...common,
        trackId: p.id,
        title: p.title,
        lyricsText: null,
        kind: "beat",
      });
    else if (p.firstTrack)
      player.play({
        ...common,
        trackId: p.firstTrack.id,
        title: p.firstTrack.title,
        lyricsText: p.firstTrack.lyricsText,
      });
  }

  // Share opens a sheet first: Post to Socials or copy/send the link (2026-11-11).
  const [shareOpen, setShareOpen] = useState(false);
  function share() {
    setShareOpen(true);
  }

  const badge = trending
    ? { label: "TRENDING", cls: "bg-red text-white", flame: true }
    : soldOut
      ? {
          label: "SOLD OUT",
          cls: "bg-black/70 text-white border border-white/15",
          flame: false,
        }
      : isNew
        ? {
            label: "NEW",
            cls: "bg-black/60 text-white border border-white/10",
            flame: false,
          }
        : isFree
          ? {
              label: "FREE",
              cls: "bg-black/60 text-white border border-white/10",
              flame: false,
            }
          : null;

  if (hidden) return null;
  // Music "Buy Now" opens checkout straight away on the release page (prototype: buy → checkout).
  const buyHref = p.type === "RELEASE" && !p.payWhatYouWant ? `${href}?buy=1` : href;
  const priceLabel = isFree ? "Free" : `${naira(p.priceKobo)}${p.payWhatYouWant ? "+" : ""}`;
  const menu = (
    <FeedCardMenu
      open={menuOpen}
      onClose={closeMenu}
      productId={p.id}
      title={p.title}
      href={href}
      creator={{ id: p.creatorId, handle: p.creator.handle, displayName: p.creator.displayName }}
      onShare={share}
    />
  );
  const shareSheet = (
    <ProductShareSheet
      open={shareOpen}
      onClose={() => setShareOpen(false)}
      item={{
        type: "product",
        id: p.id,
        label: p.type === "RELEASE" ? "Music" : p.type === "BEAT" ? "Beat" : p.type === "MERCH" ? "Merch" : "Event",
        title: p.title,
        subtitle: [p.creator.displayName, kindLabel(p, isNew)].filter(Boolean).join(" · "),
        imageUrl: image,
        path: href,
        shareText: `${p.title} by ${p.creator.displayName} on XOLDOUT`,
      }}
    />
  );

  if (compact) {
    const meta = [p.beat?.genre, p.beat?.bpm ? `${p.beat.bpm} BPM` : null].filter(Boolean).join(" • ") || kindLabel(p, isNew);
    return (
      <article className="rounded-[24px] border border-line-soft bg-surface p-4">
        <div className="flex gap-4">
          <Link href={href} aria-label={p.title} className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-red/50 via-red-tint to-black min-[400px]:h-32 min-[400px]:w-32">
            <ArtworkImage src={image} alt={p.title} sizes="128px" priority={priority} unoptimized className="object-cover" />
            {badge && (
              <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide ${badge.cls}`}>{badge.label}</span>
            )}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/u/${p.creator.handle}`} className="flex min-w-0 items-center gap-1.5 pt-0.5 text-[14px] font-semibold text-ink-2">
                <span className="truncate">{p.creator.displayName}</span>
                {p.isVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" badgeType={primaryBadgeType(p.verificationBadges)} />}
                <CountryFlag code={p.creator.countryCode} />
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="More options"
                aria-expanded={menuOpen}
                className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
            </div>
            <Link href={href} className="mt-0.5 block font-serif text-[24px] font-bold leading-[1.1] line-clamp-2 [overflow-wrap:anywhere]">
              {p.title}
            </Link>
            <p className="mt-1 truncate text-[14px] text-ink-3">{meta}</p>
            <p className="mt-1 text-[16px] font-bold text-red-soft">{priceLabel}</p>
          </div>
        </div>

        <p className={`mt-3 text-[14px] leading-relaxed text-ink-3 ${expanded ? "" : "line-clamp-2"}`}>{blurb}</p>
        <div className="mt-1.5 flex items-center gap-5 text-[13px] font-semibold">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-red-soft">
            {expanded ? "See less" : "See more"}
          </button>
          <Link href={href} className="text-ink">
            See details
          </Link>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlayingThis ? `Pause ${p.title}` : `Play a preview of ${p.title}`}
            className="flex items-center gap-3 text-[15px] font-semibold text-ink-2"
          >
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black">
              {(p.type === "BEAT" ? p.id : p.firstTrack?.id) && <PlayProgressRing trackId={(p.type === "BEAT" ? p.id : p.firstTrack?.id) as string} />}
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
            </span>
            {isPlayingThis ? "Playing preview" : "Preview"}
          </button>
          {owned ? (
            <Link href={href} className="rounded-full border border-line px-5 py-3 text-[14px] font-semibold text-ink-3">
              Owned
            </Link>
          ) : soldOut ? (
            <span className="rounded-full border border-line px-5 py-3 text-[14px] font-semibold text-ink-3">Sold out</span>
          ) : (
            <Link href={buyHref} className="inline-flex items-center gap-2 rounded-full bg-red px-6 py-3 text-[16px] font-bold text-white">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 8h12l-1 12H7L6 8z" strokeLinejoin="round" />
                <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
              </svg>
              {isFree ? "Get Free" : "Buy Now"}
            </Link>
          )}
        </div>
        {menu}
        {shareSheet}
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-[28px] border border-line-soft bg-surface">
      <div className="relative aspect-[5/6] w-full bg-gradient-to-br from-red/50 via-red-tint to-black">
        <Link href={href} aria-label={p.title} className="absolute inset-0">
          <ArtworkImage
            src={image}
            alt={p.title}
            sizes="(max-width: 640px) 100vw, 480px"
            priority={priority}
            unoptimized
            className="object-cover"
          />
        </Link>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black via-black/60 to-transparent" />
        {badge && (
          <span
            className={`absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-extrabold tracking-wide ${badge.cls}`}
          >
            {badge.flame && (
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2s5 4.5 5 10a5 5 0 01-10 0c0-2 1-3.5 1-3.5S9 11 10.5 11C10.5 7 12 2 12 2z" />
              </svg>
            )}
            {badge.label}
          </span>
        )}
        {(p.addOnCount ?? 0) > 0 && (
          <span className="absolute right-14 top-4 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-red-soft">
            E+
          </span>
        )}
        {/* ⋮ menu (design/v2-prototype) */}
        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="More options"
            aria-expanded={menuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="currentColor"
              aria-hidden
            >
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          {menu}
          {shareSheet}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 px-5 pb-5">
          <div className="min-w-0">
            <Link
              href={`/u/${p.creator.handle}`}
              className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-2"
            >
              <span className="truncate">{p.creator.displayName}</span>
              {p.isVerified && (
                <VerifiedBadge
                  className="h-3.5 w-3.5 shrink-0"
                  badgeType={primaryBadgeType(p.verificationBadges)}
                />
              )}
              <CountryFlag code={p.creator.countryCode} />
            </Link>
            <Link
              href={href}
              className="mt-1 block font-serif text-[30px] font-bold leading-[1.05] line-clamp-2 [overflow-wrap:anywhere] min-[380px]:text-[34px]"
            >
              {p.title}
            </Link>
            <p className="mt-1 text-[15px] text-ink-2">
              {kindLabel(p, isNew)} ·{" "}
              <span className="font-semibold text-red-soft">
                {isFree
                  ? "Free"
                  : `${naira(p.priceKobo)}${p.payWhatYouWant ? "+" : ""}`}
              </span>
            </p>
          </div>
          {canPlay && (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={
                isPlayingThis
                  ? `Pause ${p.title}`
                  : `Play a preview of ${p.title}`
              }
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg"
            >
              {(p.type === "BEAT" ? p.id : p.firstTrack?.id) && <PlayProgressRing trackId={(p.type === "BEAT" ? p.id : p.firstTrack?.id) as string} />}
              {isPlayingThis ? (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="currentColor"
                  aria-hidden
                >
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 translate-x-[1px]"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 pt-4">
        <p
          className={`text-[14px] leading-relaxed text-ink-3 ${expanded ? "" : "line-clamp-2"}`}
        >
          {blurb}
        </p>
        <div className="mt-2 flex items-center gap-5 text-[13px] font-semibold">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-red-soft"
          >
            {expanded ? "See less" : "See more"}
          </button>
          <Link href={href} className="text-ink">
            See details
          </Link>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-ink-2">
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={liked}
              aria-label={liked ? `Unlike ${p.title}` : `Like ${p.title}`}
              className={`flex items-center gap-1.5 text-[15px] font-semibold ${liked ? "text-red-soft" : "hover:text-ink"}`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[24px] w-[24px]"
                fill={liked ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path
                  d="M12 20.5s-7.5-4.4-9.4-9C1.1 7.8 3.4 4.5 7 4.5c2 0 3.4 1.1 5 2.9 1.6-1.8 3-2.9 5-2.9 3.6 0 5.9 3.3 4.4 7-1.9 4.6-9.4 9-9.4 9z"
                  strokeLinejoin="round"
                />
              </svg>
              {Math.max(0, (p.likeCount ?? 0) + likeDelta)}
            </button>
            <button
              type="button"
              onClick={() => (commentTarget ? setCommentsOpen(true) : router.push(href))}
              aria-label={`Comments on ${p.title}`}
              className="flex items-center gap-1.5 text-[15px] font-semibold hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path
                  d="M21 11.5a8.5 8.5 0 01-8.5 8.5c-1.2 0-2.3-.25-3.3-.7L4 20l.9-4.5A8.5 8.5 0 1121 11.5z"
                  strokeLinejoin="round"
                />
              </svg>
              {(p.commentCount ?? 0) + commentsAdded > 0 ? (p.commentCount ?? 0) + commentsAdded : ""}
            </button>
            {commentTarget && (
              <FeedCommentsSheet
                open={commentsOpen}
                onClose={closeComments}
                title={p.title}
                kind={commentTarget.kind}
                trackId={commentTarget.id}
                onPosted={() => setCommentsAdded((n) => n + 1)}
              />
            )}
            <button
              type="button"
              onClick={share}
              aria-label={`Share ${p.title}`}
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[22px] w-[22px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <circle cx="18" cy="5" r="2.6" />
                <circle cx="6" cy="12" r="2.6" />
                <circle cx="18" cy="19" r="2.6" />
                <path d="M8.3 10.8l7.4-4.4M8.3 13.2l7.4 4.4" />
              </svg>
            </button>
          </div>
          {owned ? (
            <Link
              href={href}
              className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-ink-3"
            >
              Owned
            </Link>
          ) : soldOut ? (
            <span className="rounded-full border border-line px-5 py-2.5 text-[14px] font-semibold text-ink-3">
              Sold out
            </span>
          ) : (
            <Link
              href={buyHref}
              className="inline-flex items-center gap-2 rounded-full bg-red px-5 py-2.5 text-[15px] font-bold text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
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
