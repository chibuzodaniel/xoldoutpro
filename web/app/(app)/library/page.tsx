"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { usePlayer } from "@/components/player/PlayerProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  downloadTrackForOffline,
  isDownloaded,
  removeDownload,
  totalDownloadBytes,
} from "@/lib/offline/downloads";

type LibraryTrack = {
  id: string;
  title: string;
  order: number;
  durationSec: number;
  lyricsText: string | null;
};

type LibraryEntitlement = {
  id: string;
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

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LibraryPage() {
  const player = usePlayer();
  const [entitlements, setEntitlements] = useState<LibraryEntitlement[] | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});
  const [busyTrackId, setBusyTrackId] = useState<string | null>(null);
  const [usageBytes, setUsageBytes] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refreshDownloadState = useCallback(async (tracks: LibraryTrack[]) => {
    const entries = await Promise.all(tracks.map(async (t) => [t.id, await isDownloaded(t.id)] as const));
    setDownloaded((cur) => ({ ...cur, ...Object.fromEntries(entries) }));
    setUsageBytes(await totalDownloadBytes());
  }, []);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/library");
      if (!res.ok) return;
      const data: { entitlements: LibraryEntitlement[] } = await res.json();
      setEntitlements(data.entitlements);
      const allTracks = data.entitlements.flatMap((e) => e.product.release?.tracks ?? []);
      await refreshDownloadState(allTracks);
    }
    load();
  }, [refreshDownloadState]);

  async function handleDownload(entitlement: LibraryEntitlement, track: LibraryTrack) {
    setError(null);
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
      setUsageBytes(await totalDownloadBytes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setBusyTrackId(null);
    }
  }

  async function handleRemoveDownload(trackId: string) {
    await removeDownload(trackId);
    setDownloaded((cur) => ({ ...cur, [trackId]: false }));
    setUsageBytes(await totalDownloadBytes());
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-serif text-2xl">Library</h1>
      </div>
      {usageBytes > 0 && <p className="text-xs text-ink-3 mb-6">{formatBytes(usageBytes)} downloaded on this device</p>}
      {error && <p className="text-sm text-red-soft mb-4">{error}</p>}

      {entitlements === null ? (
        <LoadingSpinner full size="md" />
      ) : entitlements.length === 0 ? (
        <p className="text-sm text-ink-3">Everything you buy shows up here, playable offline. Nothing yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {entitlements.map((e) =>
            e.product.release ? (
              <div key={e.id}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-11 w-11 rounded bg-surface-2 overflow-hidden shrink-0">
                    {artworkUrl(e.product.release, "64") && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={artworkUrl(e.product.release, "64")!} alt={e.product.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{e.product.title}</p>
                    <p className="text-xs text-ink-3">{e.product.creator.displayName}</p>
                  </div>
                </div>
                <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                  {e.product.release.tracks.map((track) => (
                    <div key={track.id} className="flex items-center justify-between py-2.5">
                      <button
                        onClick={() =>
                          player.play({
                            trackId: track.id,
                            title: track.title,
                            artistName: e.product.creator.displayName,
                            artworkUrl: artworkUrl(e.product.release, "1024"),
                            lyricsText: track.lyricsText,
                          })
                        }
                        className="text-sm text-left flex-1"
                      >
                        {track.title}
                      </button>
                      {downloaded[track.id] ? (
                        <button onClick={() => handleRemoveDownload(track.id)} className="text-[10px] text-ink-3 uppercase tracking-widest">
                          Downloaded · Remove
                        </button>
                      ) : (
                        <button
                          onClick={() => handleDownload(e, track)}
                          disabled={busyTrackId === track.id}
                          className="text-[10px] text-red-soft uppercase tracking-widest disabled:opacity-50"
                        >
                          {busyTrackId === track.id ? "Downloading…" : "Download"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : e.product.beat ? (
              <BeatLibraryRow key={e.id} entitlement={e} player={player} />
            ) : e.product.merchItem ? (
              <MerchLibraryRow key={e.id} entitlement={e} />
            ) : e.product.ticketTier ? (
              <EventLibraryRow key={e.id} entitlement={e} />
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}

// Beats go through the shared PlayerProvider/mini-player, same as Release
// tracks (kind:"beat" — see PlayerProvider.play()). No offline caching yet,
// unlike Release tracks: the "Download" button already hands over the real
// master file, so there's no separate offline-cache format to build for it.
function BeatLibraryRow({ entitlement, player }: { entitlement: LibraryEntitlement; player: ReturnType<typeof usePlayer> }) {
  const productId = entitlement.product.id;
  const isThisTrack = player.current?.trackId === productId && player.current?.kind === "beat";
  const isPlaying = isThisTrack && player.isPlaying;
  const loading = isThisTrack && player.loading;

  function handleTogglePlay() {
    if (isThisTrack) {
      player.togglePlay();
      return;
    }
    player.play({
      trackId: productId,
      title: entitlement.product.title,
      artistName: entitlement.product.creator.displayName,
      artworkUrl: beatCoverUrl(entitlement.product.beat, "1024"),
      lyricsText: null,
      kind: "beat",
    });
  }

  async function handleDownload() {
    const res = await apiFetch(`/api/beats/${entitlement.product.id}/audio-url`);
    if (!res.ok) return;
    const data = await res.json();
    window.location.href = data.url;
  }

  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded bg-surface-2 overflow-hidden shrink-0">
        {beatCoverUrl(entitlement.product.beat, "64") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={beatCoverUrl(entitlement.product.beat, "64")!}
            alt={entitlement.product.title}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold line-clamp-1">{entitlement.product.title}</p>
        <p className="text-xs text-ink-3">{entitlement.product.creator.displayName}</p>
      </div>
      <button
        onClick={handleTogglePlay}
        disabled={loading}
        className="h-8 w-8 rounded-full bg-red flex items-center justify-center shrink-0 disabled:opacity-50"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white">
            <rect x="6" y="5" width="4" height="14" />
            <rect x="14" y="5" width="4" height="14" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-white translate-x-[1px]">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <button onClick={handleDownload} className="text-[10px] text-red-soft uppercase tracking-widest shrink-0">
        Download
      </button>
    </div>
  );
}

// No play/download for merch — just what a fan bought and its shipping status.
function MerchLibraryRow({ entitlement }: { entitlement: LibraryEntitlement }) {
  const status = entitlement.order.merchFulfillment?.status ?? "TO_SHIP";
  return (
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded bg-surface-2 overflow-hidden shrink-0">
        {merchImageUrl(entitlement.product.merchItem, "64") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={merchImageUrl(entitlement.product.merchItem, "64")!}
            alt={entitlement.product.title}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold line-clamp-1">{entitlement.product.title}</p>
        <p className="text-xs text-ink-3">{entitlement.product.creator.displayName}</p>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-red-soft font-semibold shrink-0">
        {FULFILLMENT_LABEL[status]}
      </span>
    </div>
  );
}

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// A ticket in the library is the QR code itself, not something to play —
// this is the one place the entitlement's TicketCheckIn.code actually
// surfaces to the buyer.
function EventLibraryRow({ entitlement }: { entitlement: LibraryEntitlement }) {
  const tier = entitlement.product.ticketTier;
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!entitlement.checkIn) return;
    QRCode.toDataURL(entitlement.checkIn.code, { margin: 1, width: 200 }).then(setQr);
  }, [entitlement.checkIn]);

  if (!tier) return null;

  return (
    <div className="rounded-lg border border-line bg-surface p-4 flex items-center gap-4">
      {qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr} alt="Ticket QR code" className="h-16 w-16 rounded bg-white p-1 shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold line-clamp-1">{tier.event.title}</p>
        <p className="text-xs text-ink-3 mb-1">
          {tier.name} · {formatEventDate(tier.event.startsAt)}
        </p>
        <p className="text-[10px] uppercase tracking-widest text-red-soft font-semibold">
          {entitlement.checkIn?.checkedInAt ? "Checked in" : "Show this QR code at the door"}
        </p>
      </div>
    </div>
  );
}
