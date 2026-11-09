"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { usePlayer, type PlayableTrack } from "@/components/player/PlayerProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { downloadTrackForOffline, isDownloaded, removeDownload } from "@/lib/offline/downloads";
import { CollectionsTab } from "@/components/library/CollectionsTab";
import { NotificationsSheet } from "@/components/notifications/NotificationsSheet";
import { AddToCollectionSheet } from "@/components/library/AddToCollectionSheet";
import { TicketQrCode } from "@/components/ui/TicketQrCode";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { useToast } from "@/components/ui/ToastProvider";
import { downloadViaSignedLink } from "@/lib/downloadFile";

type LibraryTrack = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  durationSec: number;
  lyricsText: string | null;
};

type LibraryEntitlement = {
  id: string;
  pinnedAt: string | null;
  product: {
    id: string;
    title: string;
    creator: { displayName: string; handle: string };
    release: { artworkLadder: unknown; tracks: LibraryTrack[] } | null;
    beat: { coverImageLadder: unknown; durationSec: number } | null;
    merchItem: { imageLadder: unknown } | null;
    ticketTier: {
      name: string;
      event: { title: string; venue: string | null; isVirtual: boolean; startsAt: string; coverImageLadder: unknown };
    } | null;
  };
  order: {
    merchFulfillment: { status: "TO_SHIP" | "SHIPPED" | "DELIVERED"; trackingInfo: string | null } | null;
  };
  checkIn: { code: string; checkedInAt: string | null } | null;
};

function artworkUrl(release: LibraryEntitlement["product"]["release"], size: "64" | "1024") {
  const ladder = release?.artworkLadder as Record<string, string> | undefined;
  return ladder?.[size] ?? null;
}

function beatCoverUrl(beat: LibraryEntitlement["product"]["beat"], size: "64" | "1024") {
  const ladder = beat?.coverImageLadder as Record<string, string> | undefined;
  return ladder?.[size] ?? null;
}

function merchImageUrl(merchItem: LibraryEntitlement["product"]["merchItem"], size: "64" | "1024") {
  const ladder = merchItem?.imageLadder as Record<string, string> | undefined;
  return ladder?.[size] ?? null;
}

const FULFILLMENT_LABEL: Record<"TO_SHIP" | "SHIPPED" | "DELIVERED", string> = {
  TO_SHIP: "Preparing to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

const TABS = [
  { key: "purchased", label: "Purchased" },
  // v2 (design/v2-prototype): shown as "Your Playlist"; the key stays
  // "collections" so ?tab=collections links keep working.
  { key: "collections", label: "Your Playlist" },
  { key: "events", label: "Events" },
] as const;
type LibraryTab = (typeof TABS)[number]["key"];

const TAB_KEYS = TABS.map((t) => t.key);

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryPageInner />
    </Suspense>
  );
}

function LibraryPageInner() {
  const player = usePlayer();
  const toast = useToast();
  const initialTab = useSearchParams().get("tab");
  const [tab, setTab] = useState<LibraryTab>(
    TAB_KEYS.includes(initialTab as LibraryTab) ? (initialTab as LibraryTab) : "purchased",
  );
  const [entitlements, setEntitlements] = useState<LibraryEntitlement[] | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [downloadingProductId, setDownloadingProductId] = useState<string | null>(null);
  // Defaults true (the common case) so download controls don't flash in
  // then out for everyone — corrected once /api/library loads. When a
  // super-moderator turns real-file downloads off, these hide entirely;
  // the "Offline" in-app cache (lib/offline/downloads.ts) is unaffected.
  const [downloadsAllowed, setDownloadsAllowed] = useState(true);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<LibraryEntitlement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [seeAll, setSeeAll] = useState<Record<string, boolean>>({});
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const toggleSeeAll = (key: string) => setSeeAll((cur) => ({ ...cur, [key]: !cur[key] }));

  // The bell's red dot — one fetch when the page opens and again when
  // notifications change (same event AppHeader listens to); no polling.
  useEffect(() => {
    const refresh = () =>
      apiFetch("/api/notifications")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data && setUnreadCount(data.unreadCount))
        .catch(() => {});
    refresh();
    window.addEventListener("xoldout:notifications-changed", refresh);
    return () => window.removeEventListener("xoldout:notifications-changed", refresh);
  }, []);

  const refreshDownloadState = useCallback(async (tracks: LibraryTrack[]) => {
    const entries = await Promise.all(tracks.map(async (t) => [t.id, await isDownloaded(t.id)] as const));
    setDownloaded((cur) => ({ ...cur, ...Object.fromEntries(entries) }));
  }, []);

  const loadLibrary = useCallback(async () => {
    const res = await apiFetch("/api/library");
    if (!res.ok) return;
    const data: { entitlements: LibraryEntitlement[]; downloadsEnabled?: boolean } = await res.json();
    setEntitlements(data.entitlements);
    setDownloadsAllowed(data.downloadsEnabled ?? true);
    const allTracks = data.entitlements.flatMap((e) => e.product.release?.tracks ?? []);
    await refreshDownloadState(allTracks);
  }, [refreshDownloadState]);

  useEffect(() => {
    async function run() {
      await loadLibrary();
    }
    run();
  }, [loadLibrary]);

  // Per-tile long-press bookkeeping, keyed by entitlement id. A plain ref
  // (not React state) since a timer firing doesn't need to trigger a
  // render — it just needs to survive one, since this whole page re-renders
  // every second while something plays (the mini-player's live position
  // ticking flows through the same usePlayer() context this page reads),
  // which a per-render-recreated timer would lose mid-press.
  const longPressRef = useRef<Record<string, { timer: ReturnType<typeof setTimeout> | null; fired: boolean }>>({});

  function longPressState(id: string) {
    if (!longPressRef.current[id]) longPressRef.current[id] = { timer: null, fired: false };
    return longPressRef.current[id];
  }

  // Every longPressRef.current touch happens inside these callbacks, never
  // in the body of longPressTriggerProps itself — the callbacks only run
  // later, at actual pointer-event time, whereas the function body runs
  // during render and must stay ref-free.
  function longPressTriggerProps(id: string, onLongPress: () => void) {
    return {
      onPointerDown: () => {
        const state = longPressState(id);
        state.fired = false;
        state.timer = setTimeout(() => {
          state.fired = true;
          onLongPress();
        }, 500);
      },
      onPointerUp: () => {
        const state = longPressRef.current[id];
        if (state?.timer) clearTimeout(state.timer);
      },
      onPointerLeave: () => {
        const state = longPressRef.current[id];
        if (state?.timer) clearTimeout(state.timer);
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
  }

  // A tap's normal action (play/expand) is suppressed when the press that
  // just ended was actually a long-press — otherwise the actions sheet
  // would pop up from longPressTriggerProps AND the tile would also start
  // playing/expanding from the same gesture's trailing click event.
  function guardedClick(id: string, onClick: () => void) {
    return () => {
      const state = longPressState(id);
      if (state.fired) {
        state.fired = false;
        return;
      }
      onClick();
    };
  }

  async function handleDownload(entitlement: LibraryEntitlement, track: LibraryTrack) {
    setBusyTrackId(track.id);
    try {
      await downloadTrackForOffline({
        trackId: track.id,
        productId: entitlement.product.id,
        title: track.title,
        artistName: entitlement.product.creator.displayName,
        artworkUrl: artworkUrl(entitlement.product.release, "1024"),
        durationSec: track.durationSec,
      });
      setDownloaded((cur) => ({ ...cur, [track.id]: true }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyTrackId(null);
    }
  }

  // Real file save to the device (distinct from "Download for offline"
  // above, which just caches an encrypted copy for in-app playback) —
  // explicit ask: this should be reachable from the Library, not just the
  // release's own /r/[id] page.
  async function handleDownloadFile(track: LibraryTrack) {
    setBusyTrackId(track.id);
    try {
      const res = await apiFetch(`/api/tracks/${track.id}/audio-url?download=1&link=1`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not download track");
      }
      await downloadViaSignedLink(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyTrackId(null);
    }
  }

  // A release can have several tracks — the floating download icon on its
  // tile downloads all of them as separate files, one save-dialog per
  // track (matches how handleDownloadAllForRelease already loops for the
  // offline-cache case below).
  async function handleDownloadReleaseFiles(tracks: LibraryTrack[]) {
    for (const track of tracks) {
      await handleDownloadFile(track);
    }
  }

  // Wraps the tile's floating download icon (either branch below) so it
  // shows a busy state the instant it's tapped — explicit ask: it "doesn't
  // press immediately, it takes time to respond." The fetch+ffmpeg round
  // trip genuinely does take a few seconds; the fix is showing that it's
  // working right away, not making it faster.
  async function handleTileDownload(e: LibraryEntitlement) {
    setDownloadingProductId(e.product.id);
    try {
      if (e.product.beat) {
        await handleDownloadBeatFile(e.product.id);
      } else if (e.product.release) {
        await handleDownloadReleaseFiles(e.product.release.tracks);
      }
    } finally {
      setDownloadingProductId(null);
    }
  }

  async function handleDownloadBeatFile(productId: string) {
    try {
      const res = await apiFetch(`/api/beats/${productId}/audio-url?download=1&link=1`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not download beat");
      }
      await downloadViaSignedLink(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleRemoveDownload(trackId: string) {
    await removeDownload(trackId);
    setDownloaded((cur) => ({ ...cur, [trackId]: false }));
  }

  // Shared by handlePlayTap, handleShuffle, and handlePlayNext — every
  // release track, or the single beat "track", as PlayableTrack[]. Empty
  // for merch/tickets, which never reach any of these call sites.
  function buildPlayable(entitlement: LibraryEntitlement): PlayableTrack[] {
    if (entitlement.product.release) {
      return entitlement.product.release.tracks.map((t) => ({
        trackId: t.id,
        title: t.title,
        artistName: entitlement.product.creator.displayName,
        artworkUrl: artworkUrl(entitlement.product.release, "1024"),
        lyricsText: t.lyricsText,
        productId: entitlement.product.id,
      }));
    }
    if (entitlement.product.beat) {
      return [
        {
          trackId: entitlement.product.id,
          title: entitlement.product.title,
          artistName: entitlement.product.creator.displayName,
          artworkUrl: beatCoverUrl(entitlement.product.beat, "1024"),
          lyricsText: null,
          kind: "beat",
          productId: entitlement.product.id,
        },
      ];
    }
    return [];
  }

  // Tapping to play is now fully separate from expanding the tracklist
  // panel (see handleExpandTap) — explicit ask: the mini-player is the only
  // "now playing" surface that should react to a tap, not an in-page
  // dropdown forced open alongside it. A multi-track release queues every
  // track (not just the first) so repeatMode's existing "all"/"off"/"one"
  // handling (PlayerProvider's onEnded) does the right thing on its own —
  // loop the album, fall through to something else, or repeat the one
  // track — instead of this call site special-casing single vs. multi.
  function handlePlayTap(entitlement: LibraryEntitlement) {
    // Explicit ask: retapping something already playing must never restart
    // it from the top or pause it — resume only if it had actually been
    // paused, otherwise leave it exactly as it is. productId alone is
    // enough to identify "this item" — release and beat productIds are
    // both just Product ids, never colliding across types.
    if (player.current?.productId === entitlement.product.id) {
      if (!player.isPlaying) player.togglePlay();
      return;
    }

    const trackQueue = buildPlayable(entitlement);
    const firstTrack = trackQueue[0];
    if (!firstTrack) return;
    player.play(firstTrack, trackQueue);
    player.setExpanded(true);
  }

  // Expanding the tracklist is its own action now (tapping the title/creator
  // text, not the artwork) — purely for picking a specific track or
  // downloading one, never tied to starting playback. Beats have no
  // tracklist to browse (and already have their own Download button on
  // /b/[id]), so this is release-only; handlePlayTap covers beats fully.
  function handleExpandTap(entitlementId: string) {
    setExpandedId((cur) => (cur === entitlementId ? null : entitlementId));
  }

  async function handleShare(entitlement: LibraryEntitlement) {
    const path = entitlement.product.release ? `/r/${entitlement.product.id}` : `/b/${entitlement.product.id}`;
    const url = `${window.location.origin}${path}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: entitlement.product.title, url });
      } catch {
        // User dismissed the share sheet — not an error worth surfacing.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  // Fisher-Yates rather than play() immediately followed by toggleShuffle():
  // toggleShuffle reads queueIndex/shuffled from its own closure, which is
  // stale until this render commits, so calling both in the same tick can
  // shuffle around the wrong "current" track.
  function handleShuffle(entitlement: LibraryEntitlement) {
    const tracks = buildPlayable(entitlement);
    if (tracks.length < 2) return;
    const shuffled = [...tracks];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    player.play(shuffled[0], shuffled);
    player.setExpanded(true);
  }

  async function handleTogglePin(entitlement: LibraryEntitlement) {
    const pinned = !entitlement.pinnedAt;
    const res = await apiFetch("/api/library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entitlementId: entitlement.id, pinned }),
    });
    if (!res.ok) {
      toast.error("Couldn't update pin");
      return;
    }
    await loadLibrary();
  }

  function handlePlayNext(entitlement: LibraryEntitlement) {
    const tracks = buildPlayable(entitlement);
    if (tracks.length === 0) return;
    player.playNext(tracks);
    toast.success("Added to play next");
  }

  // Release-only, per the "remove downloaded offline copy only" clarification
  // — this never touches the purchase/entitlement itself, just the local
  // offline cache, so it's safe to run without a confirmation dialog.
  async function handleDownloadAllForRelease(entitlement: LibraryEntitlement) {
    const tracks = entitlement.product.release?.tracks ?? [];
    for (const track of tracks) {
      if (!downloaded[track.id]) await handleDownload(entitlement, track);
    }
  }

  async function handleRemoveAllForRelease(entitlement: LibraryEntitlement) {
    const tracks = entitlement.product.release?.tracks ?? [];
    for (const track of tracks) {
      if (downloaded[track.id]) await handleRemoveDownload(track.id);
    }
  }

  const q = query.trim().toLowerCase();
  const visible =
    entitlements?.filter(
      (e) => !q || [e.product.title, e.product.creator.displayName, e.product.ticketTier?.event.title].some((s) => s?.toLowerCase().includes(q)),
    ) ?? null;
  const musicItems = visible?.filter((e) => e.product.release || e.product.beat) ?? [];
  // v2: songs and beats get their own shelves (design/v2-prototype). The
  // tile renderer is shared, so only the grouping changes.
  const songItems = musicItems.filter((e) => e.product.release);
  const beatItems = musicItems.filter((e) => e.product.beat);
  const merchItems = visible?.filter((e) => e.product.merchItem) ?? [];
  const ticketItems = visible?.filter((e) => e.product.ticketTier) ?? [];
  const expandedEntitlement = musicItems.find((e) => e.id === expandedId && e.product.release) ?? null;

  function renderMusicTile(e: LibraryEntitlement, className: string) {
    const tileArt = e.product.release ? artworkUrl(e.product.release, "1024") : beatCoverUrl(e.product.beat, "1024");
    const isPlaying = e.product.release
      ? player.isPlaying && e.product.release.tracks.some((t) => t.id === player.current?.trackId)
      : player.isPlaying && player.current?.trackId === e.product.id && player.current?.kind === "beat";
    return (
      <div key={e.id} className={className} {...longPressTriggerProps(e.id, () => setActionsFor(e))}>
        <button type="button" onClick={guardedClick(e.id, () => handlePlayTap(e))} className="block w-full text-left">
          <div className={`relative aspect-square rounded-xl bg-surface-2 overflow-hidden mb-2 border ${expandedId === e.id ? "border-red" : "border-line-soft"}`}>
            <FallbackImg src={tileArt} alt={e.product.title} className="h-full w-full object-cover" fallback={null} />
            {e.pinnedAt && (
              <span className="absolute top-2 left-2 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center" aria-label="Pinned">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white">
                  <path d="M16 3l5 5-4 2-3 6-2-2-5 5-1-1 5-5-2-2 6-3 2-4z" />
                </svg>
              </span>
            )}
            {isPlaying && (
              <span className="absolute bottom-2 right-2 h-6 w-6 rounded-full bg-red flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 fill-white">
                  <rect x="6" y="5" width="4" height="14" />
                  <rect x="14" y="5" width="4" height="14" />
                </svg>
              </span>
            )}
            {downloadsAllowed && (
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (downloadingProductId) return;
                  handleTileDownload(e);
                }}
                disabled={downloadingProductId === e.product.id}
                aria-label={`Download ${e.product.title} as a file`}
                className="absolute bottom-2 left-2 h-6 w-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center disabled:opacity-70"
              >
                {downloadingProductId === e.product.id ? (
                  <svg viewBox="0 0 24 24" className="h-3 w-3 animate-spin text-white">
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
                    <path d="M21 12a9 9 0 00-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3 w-3 text-white">
                    <path d="M12 3v13m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 20h14" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </button>
        {/* Title/creator opens a release's tracklist (pick a track, download);
            a beat has nothing to browse, so it just plays. */}
        <button
          type="button"
          onClick={guardedClick(e.id, () => (e.product.release ? handleExpandTap(e.id) : handlePlayTap(e)))}
          className="block w-full text-left"
        >
          <p className="text-sm font-semibold line-clamp-1">{e.product.title}</p>
          <p className="text-xs text-ink-3 line-clamp-1">{e.product.creator.displayName}</p>
        </button>
      </div>
    );
  }

  function renderTracklist(e: LibraryEntitlement) {
    if (!e.product.release) return null;
    return (
      <div className="mt-4 rounded-xl border border-line-soft bg-surface p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-ink-3 line-clamp-1">{e.product.title}</p>
          <button type="button" onClick={() => setCollectingId(e.id)} className="text-[11px] text-ink-3 uppercase tracking-widest shrink-0">
            + Collection
          </button>
        </div>
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {e.product.release.tracks.map((track) => {
            const isThisTrack = player.current?.trackId === track.id;
            const trackIsPlaying = isThisTrack && player.isPlaying;
            const loadingAudio = isThisTrack && player.loading;
            return (
              <div key={track.id} className="flex items-center gap-3 py-2.5">
                <button
                  onClick={() => {
                    player.play({
                      trackId: track.id,
                      title: track.title,
                      artistName: e.product.creator.displayName,
                      artworkUrl: artworkUrl(e.product.release, "1024"),
                      lyricsText: track.lyricsText,
                      productId: e.product.id,
                    });
                    player.setExpanded(true);
                  }}
                  disabled={loadingAudio}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:opacity-60"
                >
                  <span className="h-8 w-8 rounded-full bg-red flex items-center justify-center shrink-0" aria-hidden>
                    {trackIsPlaying ? (
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white">
                        <rect x="6" y="5" width="4" height="14" />
                        <rect x="14" y="5" width="4" height="14" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white translate-x-[1px]">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{track.title}</span>
                    <span className="block text-xs text-ink-3 truncate">{track.description || `Tap to play · ${e.product.creator.displayName}`}</span>
                  </span>
                </button>
                <div className="flex items-center gap-3 shrink-0">
                  {downloaded[track.id] ? (
                    <button onClick={() => handleRemoveDownload(track.id)} className="text-[11px] text-ink-3 uppercase tracking-widest">
                      Downloaded · Remove
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownload(e, track)}
                      disabled={busyTrackId === track.id}
                      className="text-[11px] text-red-soft uppercase tracking-widest disabled:opacity-50"
                    >
                      {busyTrackId === track.id ? "…" : "Offline"}
                    </button>
                  )}
                  {downloadsAllowed && (
                    <button
                      onClick={() => handleDownloadFile(track)}
                      disabled={busyTrackId === track.id}
                      aria-label={`Download ${track.title} as a file`}
                      className="text-[11px] text-ink-2 uppercase tracking-widest disabled:opacity-50"
                    >
                      {busyTrackId === track.id ? "…" : "Save file"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // A shelf: one swipeable row of tiles, or every tile in a grid after "See all".
  function shelf(key: string, items: LibraryEntitlement[], render: (e: LibraryEntitlement, className: string) => React.ReactNode) {
    return seeAll[key] ? (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-5">{items.map((e) => render(e, "min-w-0"))}</div>
    ) : (
      <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((e) => render(e, "w-[42%] sm:w-[23%] shrink-0 snap-start"))}
      </div>
    );
  }

  function renderMerchTile(e: LibraryEntitlement, className: string) {
    const status = e.order.merchFulfillment?.status ?? "TO_SHIP";
    return (
      <div key={e.id} className={className}>
        <div className="relative aspect-square rounded-xl bg-surface-2 overflow-hidden mb-2 border border-line-soft">
          <FallbackImg src={merchImageUrl(e.product.merchItem, "1024")} alt={e.product.title} className="h-full w-full object-cover" fallback={null} />
          <button
            type="button"
            onClick={() => setCollectingId(e.id)}
            aria-label="Add to collection"
            className="absolute top-2 right-2 h-6 w-6 rounded-full bg-black/60 text-white text-sm leading-none flex items-center justify-center"
          >
            +
          </button>
        </div>
        <p className="text-sm font-semibold line-clamp-1">{e.product.title}</p>
        <p className="text-[11px] uppercase tracking-widest text-red-soft font-semibold">{FULFILLMENT_LABEL[status]}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {/* Library redesign (explicit ask, 2026-11-04): big serif title with a
          one-line description, search + notifications on the right, and
          Purchased / Collections / Events tabs. The old Gifts tab is gone —
          a claimed gift already shows up here as a normal purchase. */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-serif text-[44px] font-bold leading-none tracking-tight">Library</h1>
          <p className="text-sm text-ink-3 mt-2">Your saved music, purchases and event tickets.</p>
        </div>
        <div className="flex items-center gap-4 pt-2 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search your library"
            aria-pressed={searchOpen}
            className={searchOpen ? "text-red-soft" : "text-ink-2"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" onClick={() => setNotificationsOpen(true)} aria-label="Notifications" className="relative text-ink-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[22px] w-[22px]">
              <path d="M18 8a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 20a2 2 0 004 0" strokeLinecap="round" />
            </svg>
            {unreadCount > 0 && <span className="absolute -top-0.5 right-0 h-2.5 w-2.5 rounded-full bg-red ring-2 ring-bg" aria-label={`${unreadCount} unread`} />}
          </button>
        </div>
      </div>

      {searchOpen && (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your songs, merch and tickets…"
          aria-label="Search your library"
          className="w-full mb-4 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-red"
        />
      )}

      <div className="-mx-4 flex items-center gap-8 overflow-x-auto border-b border-line-soft px-4 mb-6 [scrollbar-width:none]">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative pb-3 text-[15px] font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors duration-200 ${
              tab === t.key ? "text-white border-red" : "text-ink-3 border-transparent hover:text-ink-2"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "collections" && <CollectionsTab />}

      {tab !== "collections" && visible === null && <LoadingSpinner full size="md" />}

      {tab === "purchased" && visible !== null && (
        <>
          {musicItems.length === 0 && merchItems.length === 0 ? (
            <p className="text-sm text-ink-3">{q ? "Nothing matches your search." : "Everything you buy shows up here, playable offline. Nothing yet."}</p>
          ) : (
            <div className="flex flex-col gap-9">
              {songItems.length > 0 && (
                <section>
                  <ShelfHeader icon="music" title="Music" count={songItems.length} open={!!seeAll.music} onToggle={() => toggleSeeAll("music")} />
                  {shelf("music", songItems, renderMusicTile)}
                  {expandedEntitlement && renderTracklist(expandedEntitlement)}
                </section>
              )}
              {beatItems.length > 0 && (
                <section>
                  <ShelfHeader icon="beats" title="Beats" count={beatItems.length} open={!!seeAll.beats} onToggle={() => toggleSeeAll("beats")} />
                  {shelf("beats", beatItems, renderMusicTile)}
                </section>
              )}
              {merchItems.length > 0 && (
                <section>
                  <ShelfHeader icon="merch" title="Merch" count={merchItems.length} open={!!seeAll.merch} onToggle={() => toggleSeeAll("merch")} />
                  {shelf("merch", merchItems, renderMerchTile)}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {tab === "events" && visible !== null && (
        <>
          {ticketItems.length === 0 ? (
            <p className="text-sm text-ink-3">{q ? "Nothing matches your search." : "Tickets you buy show up here with their door QR code. Nothing yet."}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {ticketItems.map((e) => (
                <EventLibraryRow key={e.id} entitlement={e} onCollect={() => setCollectingId(e.id)} />
              ))}
            </div>
          )}
        </>
      )}

      <AddToCollectionSheet
        entitlementId={collectingId ?? ""}
        open={collectingId !== null}
        onClose={() => setCollectingId(null)}
      />

      {actionsFor && (
        <TileActionsSheet
          entitlement={actionsFor}
          hasDownloaded={(actionsFor.product.release?.tracks ?? []).some((t) => downloaded[t.id])}
          onClose={() => setActionsFor(null)}
          onShare={() => handleShare(actionsFor)}
          onShuffle={() => handleShuffle(actionsFor)}
          onTogglePin={() => handleTogglePin(actionsFor)}
          onAddToPlaylist={() => setCollectingId(actionsFor.id)}
          onPlayNext={() => handlePlayNext(actionsFor)}
          onDownloadAll={() => handleDownloadAllForRelease(actionsFor)}
          onRemoveAll={() => handleRemoveAllForRelease(actionsFor)}
        />
      )}

      <NotificationsSheet
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onRead={() => window.dispatchEvent(new Event("xoldout:notifications-changed"))}
      />
    </div>
  );
}

function ShelfHeader({ icon, title, count, open, onToggle }: { icon: "music" | "beats" | "merch"; title: string; count: number; open: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="flex items-center gap-2.5 font-serif text-[26px] font-bold">
        {icon === "beats" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-red-soft" aria-hidden>
            <path d="M4 6h9M4 11h9M4 16h5" strokeLinecap="round" />
            <circle cx="18" cy="15.5" r="2.6" />
            <path d="M20.6 15.5V7" strokeLinecap="round" />
          </svg>
        ) : icon === "music" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-red-soft" aria-hidden>
            <path d="M9 18V5l11-2v13" strokeLinejoin="round" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="17" cy="16" r="3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6 text-red-soft" aria-hidden>
            <path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 01-8 0z" strokeLinejoin="round" />
          </svg>
        )}
        {title}
      </h2>
      {count > 2 && (
        <button type="button" onClick={onToggle} className="flex items-center gap-1 text-[13px] text-ink-2">
          {open ? "Show less" : "See all"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

// Matches PhotoActionSheet's visual pattern (bottom sheet, divided action
// list, separate Cancel row). Shuffle/offline actions only make sense for a
// multi-track release — a beat or a single-track release hides them rather
// than showing an action that would do nothing useful.
function TileActionsSheet({
  entitlement,
  hasDownloaded,
  onClose,
  onShare,
  onShuffle,
  onTogglePin,
  onAddToPlaylist,
  onPlayNext,
  onDownloadAll,
  onRemoveAll,
}: {
  entitlement: LibraryEntitlement;
  hasDownloaded: boolean;
  onClose: () => void;
  onShare: () => void;
  onShuffle: () => void;
  onTogglePin: () => void;
  onAddToPlaylist: () => void;
  onPlayNext: () => void;
  onDownloadAll: () => void;
  onRemoveAll: () => void;
}) {
  const isRelease = !!entitlement.product.release;
  const canShuffle = (entitlement.product.release?.tracks.length ?? 0) > 1;
  const isPinned = !!entitlement.pinnedAt;

  function run(action: () => void) {
    return () => {
      action();
      onClose();
    };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="relative w-full rounded-t-2xl border-t border-line-soft bg-surface p-4 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-1 line-clamp-1">
          {entitlement.product.title}
        </p>
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-3 mt-2">
          <button type="button" onClick={run(onShare)} className="py-3.5 text-sm font-semibold text-center text-ink">
            Share
          </button>
          {canShuffle && (
            <button type="button" onClick={run(onShuffle)} className="py-3.5 text-sm font-semibold text-center text-ink">
              Shuffle
            </button>
          )}
          <button type="button" onClick={run(onTogglePin)} className="py-3.5 text-sm font-semibold text-center text-ink">
            {isPinned ? `Unpin ${isRelease ? "release" : "beat"}` : `Pin ${isRelease ? "release" : "beat"}`}
          </button>
          <button type="button" onClick={run(onAddToPlaylist)} className="py-3.5 text-sm font-semibold text-center text-ink">
            Add to playlist
          </button>
          <button type="button" onClick={run(onPlayNext)} className="py-3.5 text-sm font-semibold text-center text-ink">
            Play next
          </button>
          {isRelease && (
            <button type="button" onClick={run(onDownloadAll)} className="py-3.5 text-sm font-semibold text-center text-ink">
              Download for offline
            </button>
          )}
          {isRelease && hasDownloaded && (
            <button type="button" onClick={run(onRemoveAll)} className="py-3.5 text-sm font-semibold text-center text-red-soft">
              Delete from library
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-line py-3 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Beats go through the shared PlayerProvider/mini-player, same as Release
// tracks (kind:"beat" — see PlayerProvider.play(), triggered from the tile
// tap in handleTileTap above). No offline caching yet, unlike Release
// tracks: this Download button hands over the real master file directly,
// so there's no separate offline-cache format to build for it.
function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// A ticket in the library is the QR code itself, not something to play —
// this is the one place the entitlement's TicketCheckIn.code actually
// surfaces to the buyer.
function EventLibraryRow({ entitlement, onCollect }: { entitlement: LibraryEntitlement; onCollect: () => void }) {
  const tier = entitlement.product.ticketTier;
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!entitlement.checkIn) return;
    QRCode.toDataURL(entitlement.checkIn.code, { margin: 1, width: 512 }).then(setQr);
  }, [entitlement.checkIn]);

  if (!tier) return null;

  return (
    // v2 ticket card (design/v2-prototype). Tapping the QR still opens it full size.
    <div className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-4">
      {qr && (
        <TicketQrCode
          qrDataUrl={qr}
          label={`${tier.event.title} · ${tier.name}`}
          thumbnailClassName="h-20 w-20 rounded-xl bg-white p-1.5"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold line-clamp-1">{tier.event.title}</p>
        <p className="text-[14px] text-ink-2 mt-0.5">{formatEventDate(tier.event.startsAt)}</p>
        <p className="text-[13px] text-ink-3 mb-1.5">{tier.name}</p>
        <p className="text-[11px] uppercase tracking-widest text-red-soft font-semibold">
          {entitlement.checkIn?.checkedInAt ? "Checked in" : "Show this QR code at the door"}
        </p>
      </div>
      <button type="button" onClick={onCollect} aria-label="Add to collection" className="h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3 shrink-0">
        +
      </button>
    </div>
  );
}
