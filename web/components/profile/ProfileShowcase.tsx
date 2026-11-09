"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArtworkImage } from "@/components/ui/ArtworkImage";
import { usePlayer, type PlayableTrack } from "@/components/player/PlayerProvider";
import { useOwnedProducts } from "@/components/product/OwnedBadges";
import { ProductCard, type ProductCardData } from "@/components/product/ProductCard";
import { EventCard, type EventCardData } from "@/components/product/EventCard";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";

// "On XOLDOUT" on a profile (design/v2-prototype, 2026-11-09): Music /
// Events / Merch tabs; music as 2-across cards with a play button and a
// "Preview all" that queues every song's preview.

export type ShowcaseProduct = ProductCardData & {
  firstTrack: { id: string; title: string; lyricsText: string | null } | null;
};

type Tab = "music" | "events" | "merch";

function imageFor(p: ShowcaseProduct) {
  const ladder = (p.type === "BEAT" ? p.beat?.coverImageLadder : p.type === "MERCH" ? p.merchItem?.imageLadder : p.release?.artworkLadder) as
    | Record<string, string>
    | undefined;
  return ladder?.["256"] ?? ladder?.["1024"] ?? null;
}

function hrefFor(p: ShowcaseProduct) {
  if (p.type === "BEAT") return `/b/${p.id}`;
  if (p.type === "MERCH") return `/m/${p.id}`;
  return `/r/${p.id}`;
}

function toTrack(p: ShowcaseProduct): PlayableTrack | null {
  const common = { artistName: p.creator.displayName, artworkUrl: imageFor(p), productId: p.id };
  if (p.type === "BEAT") return { ...common, trackId: p.id, title: p.title, lyricsText: null, kind: "beat" };
  if (p.firstTrack) return { ...common, trackId: p.firstTrack.id, title: p.firstTrack.title, lyricsText: p.firstTrack.lyricsText };
  return null;
}

function SongCard({ product: p, queue }: { product: ShowcaseProduct; queue: PlayableTrack[] }) {
  const player = usePlayer();
  const owned = useOwnedProducts().has(p.id);
  const track = toTrack(p);
  const playing = track && player.current?.trackId === track.trackId && player.isPlaying;
  const toast = useToast();
  // Options sheet (design/v2-prototype "Options for <title>").
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const row = "flex w-full items-center px-5 py-4 text-left text-[16px] font-semibold hover:bg-surface-2";

  async function share() {
    setMenuOpen(false);
    const url = `${window.location.origin}${hrefFor(p)}`;
    try {
      if (navigator.share) await navigator.share({ title: p.title, text: `${p.title} by ${p.creator.displayName} on XOLDOUT`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line-soft bg-surface">
      <div className="relative aspect-square bg-gradient-to-br from-red/50 to-black">
        <Link href={hrefFor(p)} aria-label={p.title} className="absolute inset-0">
          <ArtworkImage src={imageFor(p)} alt={p.title} sizes="(max-width: 768px) 50vw, 240px" unoptimized className="object-cover" />
        </Link>
        {track && (
          <button
            type="button"
            onClick={() => (player.current?.trackId === track.trackId ? player.togglePlay() : player.play(track, queue))}
            aria-label={playing ? `Pause ${p.title}` : `Play ${p.title}`}
            className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white text-black shadow-lg"
          >
            {playing ? (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-[1px]" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={`Options for ${p.title}`}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
        <BottomSheet open={menuOpen} onClose={closeMenu} title={p.title}>
          {track && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                player.play(track, queue);
              }}
              className={row}
            >
              Play preview
            </button>
          )}
          <button type="button" onClick={share} className={row}>
            Share
          </button>
          <Link href={owned || p.priceKobo === 0 ? hrefFor(p) : `${hrefFor(p)}${p.type === "RELEASE" ? "?buy=1" : ""}`} onClick={closeMenu} className={row}>
            {owned ? "Open details" : p.type === "RELEASE" ? "Buy" : "Open details"}
          </Link>
        </BottomSheet>
        {owned && <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">OWNED</span>}
      </div>
      <Link href={hrefFor(p)} className="block px-3 py-2.5">
        <span className="block truncate text-[15px] font-bold">{p.title}</span>
        <span className="block truncate text-[13px] text-ink-3">{p.creator.displayName}</span>
      </Link>
    </div>
  );
}

function SongGrid({ title, items, previewAll }: { title: string; items: ShowcaseProduct[]; previewAll?: boolean }) {
  const player = usePlayer();
  const queue = items.map(toTrack).filter((t): t is PlayableTrack => Boolean(t));
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-[26px] font-bold leading-tight">{title}</h3>
        {previewAll && queue.length > 0 && (
          <button
            type="button"
            onClick={() => player.play(queue[0], queue)}
            className="inline-flex items-center gap-1.5 rounded-full bg-red px-4 py-2 text-[13px] font-bold text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M7 5v14l11-7z" strokeLinejoin="round" />
            </svg>
            Preview all
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {items.map((p) => (
          <SongCard key={p.id} product={p} queue={queue} />
        ))}
      </div>
    </section>
  );
}

const TAB_ICON: Record<Tab, React.ReactNode> = {
  music: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 18V5l11-2v13" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  ),
  events: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  ),
  merch: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 8h14l-1 12H6L5 8z" strokeLinejoin="round" />
      <path d="M9 8V6a3 3 0 016 0v2" strokeLinecap="round" />
    </svg>
  ),
};

export function ProfileShowcase({
  songs,
  beats,
  merch,
  events,
  featuredOn,
}: {
  songs: ShowcaseProduct[];
  beats: ShowcaseProduct[];
  merch: ProductCardData[];
  events: EventCardData[];
  featuredOn: ShowcaseProduct[];
}) {
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "music", label: "Music", count: songs.length + beats.length + featuredOn.length },
    { key: "events", label: "Events", count: events.length },
    { key: "merch", label: "Merch", count: merch.length },
  ];
  const [tab, setTab] = useState<Tab>(tabs.find((t) => t.count > 0)?.key ?? "music");
  if (tabs.every((t) => t.count === 0)) return null;

  return (
    <section className="mt-8">
      <h2 className="font-serif text-2xl font-bold">On XOLDOUT</h2>
      <div className="-mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative inline-flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 text-[15px] font-semibold ${
              tab === t.key ? "border-white text-white" : "border-line text-ink-3"
            }`}
          >
            {TAB_ICON[t.key]}
            {t.label}
            {tab === t.key && <span className="absolute -bottom-px left-4 right-4 h-[3px] rounded-full bg-red" />}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-8">
        {tab === "music" && (
          <>
            <SongGrid title="Available Songs" items={songs} previewAll />
            <SongGrid title="Beats" items={beats} />
            <SongGrid title="Featured on" items={featuredOn} />
            {songs.length + beats.length + featuredOn.length === 0 && <p className="text-sm text-ink-3">No music yet.</p>}
          </>
        )}
        {tab === "events" &&
          (events.length === 0 ? (
            <p className="text-sm text-ink-3">No upcoming events.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {events.map((ev) => (
                <EventCard key={ev.id} event={ev} />
              ))}
            </div>
          ))}
        {tab === "merch" &&
          (merch.length === 0 ? (
            <p className="text-sm text-ink-3">No merch yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {merch.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ))}
      </div>
    </section>
  );
}
