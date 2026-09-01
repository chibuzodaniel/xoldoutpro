"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { usePlayer, type PlayableTrack } from "@/components/player/PlayerProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { downloadTrackForOffline, isDownloaded, removeDownload } from "@/lib/offline/downloads";
import { CollectionsTab } from "@/components/library/CollectionsTab";
import { GiftsTab } from "@/components/library/GiftsTab";
import { AddToCollectionSheet } from "@/components/library/AddToCollectionSheet";
import { TicketQrCode } from "@/components/ui/TicketQrCode";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { useToast } from "@/components/ui/ToastProvider";

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
  { key: "collections", label: "Collections" },
  { key: "gifts", label: "Gifts" },
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
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<LibraryEntitlement | null>(null);

  const refreshDownloadState = useCallback(async (tracks: LibraryTrack[]) => {
    const entries = await Promise.all(tracks.map(async (t) => [t.id, await isDownloaded(t.id)] as const));
    setDownloaded((cur) => ({ ...cur, ...Object.fromEntries(entries) }));
  }, []);

  const loadLibrary = useCallback(async () => {
    const res = await apiFetch("/api/library");
    if (!res.ok) return;
    const data: { entitlements: LibraryEntitlement[] } = await res.json();
    setEntitlements(data.entitlements);
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

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-serif text-2xl">Library</h1>
      </div>

      <div className="flex items-center gap-5 border-b border-line-soft mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative pb-2.5 text-[14px] font-semibold whitespace-nowrap border-b-2 transition-colors duration-200 ${
              tab === t.key ? "text-white border-red" : "text-ink-3 border-transparent hover:text-ink-2 hover:border-line"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "collections" && <CollectionsTab />}
      {tab === "gifts" && <GiftsTab />}

      {tab === "purchased" && (
        <>
          {entitlements === null ? (
            <LoadingSpinner full size="md" />
          ) : entitlements.length === 0 ? (
            <p className="text-sm text-ink-3">Everything you buy shows up here, playable offline. Nothing yet.</p>
          ) : (
            <div className="flex flex-col gap-8">
              {(() => {
                const musicItems = entitlements.filter((e) => e.product.release || e.product.beat);
                if (musicItems.length === 0) return null;
                return (
                  <div>
                    <h2 className="text-[13px] font-bold uppercase tracking-widest text-ink-3 mb-3">Music & Beats</h2>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                      {musicItems.flatMap((e) => {
                        const tileArt = e.product.release
                          ? artworkUrl(e.product.release, "1024")
                          : beatCoverUrl(e.product.beat, "1024");
                        const isPlaying = e.product.release
                          ? player.isPlaying && e.product.release.tracks.some((t) => t.id === player.current?.trackId)
                          : player.isPlaying && player.current?.trackId === e.product.id && player.current?.kind === "beat";

                        const tile = (
                          <div key={e.id} {...longPressTriggerProps(e.id, () => setActionsFor(e))}>
                            <button
                              type="button"
                              onClick={guardedClick(e.id, () => handlePlayTap(e))}
                              className="block w-full text-left"
                            >
                              <div className="relative aspect-square rounded-lg bg-surface-2 overflow-hidden mb-2">
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
                              </div>
                            </button>
                            {/* Title/creator is its own tap target — for a
                                release it opens the tracklist (pick a track,
                                download), for a beat there's nothing to
                                browse so it just plays too, same as the
                                artwork. Kept separate from handlePlayTap so
                                viewing the tracklist never restarts playback. */}
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

                        if (expandedId !== e.id) return [tile];

                        return [
                          tile,
                          <div key={`${e.id}-detail`} className="col-span-2 rounded-lg border border-line-soft bg-surface p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs text-ink-3 line-clamp-1">{e.product.title}</p>
                              <button
                                type="button"
                                onClick={() => setCollectingId(e.id)}
                                className="text-[11px] text-ink-3 uppercase tracking-widest shrink-0"
                              >
                                + Collection
                              </button>
                            </div>
                            {e.product.release ? (
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
                                          <span className="block text-xs text-ink-3 truncate">
                                            {track.description || `Tap to play · ${e.product.creator.displayName}`}
                                          </span>
                                        </span>
                                      </button>
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
                                          {busyTrackId === track.id ? "Downloading…" : "Download"}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>,
                        ];
                      })}
                    </div>
                  </div>
                );
              })()}

              {(
                [
                  { key: "tickets", label: "Tickets", items: entitlements.filter((e) => e.product.ticketTier) },
                  { key: "merch", label: "Merch", items: entitlements.filter((e) => e.product.merchItem) },
                ] as const
              ).map(({ key, label, items }) => {
                if (items.length === 0) return null;
                return (
                  <div key={key}>
                    <h2 className="text-[13px] font-bold uppercase tracking-widest text-ink-3 mb-3">{label}</h2>
                    <div className="flex flex-col gap-6">
                      {items.map((e) =>
                        e.product.merchItem ? (
                          <MerchLibraryRow key={e.id} entitlement={e} onCollect={() => setCollectingId(e.id)} />
                        ) : e.product.ticketTier ? (
                          <EventLibraryRow key={e.id} entitlement={e} onCollect={() => setCollectingId(e.id)} />
                        ) : null,
                      )}
                    </div>
                  </div>
                );
              })}
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
// No play/download for merch — just what a fan bought and its shipping status.
function MerchLibraryRow({ entitlement, onCollect }: { entitlement: LibraryEntitlement; onCollect: () => void }) {
  const status = entitlement.order.merchFulfillment?.status ?? "TO_SHIP";
  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded bg-surface-2 overflow-hidden shrink-0">
        <FallbackImg
          src={merchImageUrl(entitlement.product.merchItem, "64")}
          alt={entitlement.product.title}
          className="h-full w-full object-cover"
          fallback={null}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold line-clamp-1">{entitlement.product.title}</p>
        <p className="text-xs text-ink-3">{entitlement.product.creator.displayName}</p>
      </div>
      <span className="text-[11px] uppercase tracking-widest text-red-soft font-semibold shrink-0">
        {FULFILLMENT_LABEL[status]}
      </span>
      <button type="button" onClick={onCollect} aria-label="Add to collection" className="h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3 shrink-0">
        +
      </button>
    </div>
  );
}

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
    <div className="rounded-lg border border-line bg-surface p-4 flex items-center gap-4">
      {qr && (
        <TicketQrCode
          qrDataUrl={qr}
          label={`${tier.event.title} · ${tier.name}`}
          thumbnailClassName="h-16 w-16 rounded bg-white p-1"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold line-clamp-1">{tier.event.title}</p>
        <p className="text-xs text-ink-3 mb-1">
          {tier.name} · {formatEventDate(tier.event.startsAt)}
        </p>
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
