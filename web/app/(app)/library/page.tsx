"use client";

import { useCallback, useEffect, useState } from "react";
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
  };
};

function artworkUrl(release: LibraryEntitlement["product"]["release"], size: "64" | "1024") {
  const ladder = release?.artworkLadder as Record<string, string> | undefined;
  return ladder?.[size] ?? null;
}

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
          {entitlements.map((e) => (
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
                {(e.product.release?.tracks ?? []).map((track) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
