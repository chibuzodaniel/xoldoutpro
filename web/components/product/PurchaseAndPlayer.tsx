"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePlayer, type PlayableTrack } from "@/components/player/PlayerProvider";
import { useAuth } from "@/components/auth/AuthProvider";

type AccessTrack = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  durationSec: number;
  previewStartSec: number;
  previewEndSec: number;
  lyricsText: string | null;
};

type Props = {
  productId: string;
  artistName: string;
  artworkUrl: string | null;
  priceKobo: number;
  isSoldOut: boolean;
};

function formatNaira(kobo: number) {
  if (kobo === 0) return "Get for free";
  return `Buy · ₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PurchaseAndPlayer({ productId, artistName, artworkUrl, priceKobo, isSoldOut }: Props) {
  const router = useRouter();
  const player = usePlayer();
  const { firebaseUser } = useAuth();
  const [entitled, setEntitled] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [tracks, setTracks] = useState<AccessTrack[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [gifting, setGifting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch(`/api/products/${productId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setEntitled(data.entitled);
    setIsOwner(data.isOwner);
    setTracks(data.tracks);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleBuy() {
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify({ productId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.free) {
        await load();
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleGift() {
    if (!firebaseUser) {
      router.push("/login");
      return;
    }
    setError(null);
    setGifting(true);
    try {
      const res = await apiFetch("/api/orders", { method: "POST", body: JSON.stringify({ productId, isGift: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start checkout");
      if (data.free) {
        router.push("/library?tab=gifts");
      } else {
        router.push(data.checkoutUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGifting(false);
    }
  }

  function handlePlay(track: AccessTrack) {
    const trackQueue: PlayableTrack[] = (tracks ?? []).map((t) => ({
      trackId: t.id,
      title: t.title,
      artistName,
      artworkUrl,
      lyricsText: t.lyricsText,
      productId,
    }));
    player.play(
      { trackId: track.id, title: track.title, artistName, artworkUrl, lyricsText: track.lyricsText, productId },
      trackQueue,
    );
    player.setExpanded(true);
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {!entitled && !isOwner && (
          <button
            onClick={handleBuy}
            disabled={busy || isSoldOut}
            className="flex-1 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSoldOut ? "Sold out" : busy ? "Starting checkout…" : formatNaira(priceKobo)}
          </button>
        )}
        {!isOwner && !isSoldOut && (
          <button
            onClick={handleGift}
            disabled={gifting}
            className={`rounded-lg border border-line px-4 py-3 text-sm font-semibold text-ink-2 disabled:opacity-50 ${
              entitled ? "flex-1" : "shrink-0"
            }`}
          >
            {gifting ? "Starting…" : "Gift this"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-soft mb-3">{error}</p>}

      <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {(tracks ?? []).map((track) => {
          const isThisTrack = player.current?.trackId === track.id;
          const isPlaying = isThisTrack && player.isPlaying;
          const loadingAudio = isThisTrack && player.loading;
          return (
            <button
              key={track.id}
              onClick={() => handlePlay(track)}
              disabled={loadingAudio}
              className="flex items-center gap-3 py-3 text-left disabled:opacity-60"
            >
              <span className="h-9 w-9 rounded-full bg-red flex items-center justify-center shrink-0" aria-hidden>
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white">
                    <rect x="6" y="5" width="4" height="14" />
                    <rect x="14" y="5" width="4" height="14" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white translate-x-[1px]">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center text-sm">
                  <span className="truncate">{track.title}</span>
                  {!entitled && !isOwner && (
                    <span className="ml-2 shrink-0 text-[11px] text-ink-3 uppercase tracking-widest">Preview</span>
                  )}
                </span>
                <span className="block text-xs text-ink-3 line-clamp-1">
                  {track.description || `Tap to preview · ${artistName}`}
                </span>
              </span>
              <span className="text-xs text-ink-3 shrink-0">
                {entitled || isOwner ? formatTime(track.durationSec) : formatTime(track.previewEndSec - track.previewStartSec)}
              </span>
            </button>
          );
        })}
      </div>

      {entitled && (
        <p className="text-[12px] text-green mt-4">
          You own this. Playable offline once downloaded to your Library.
        </p>
      )}
    </div>
  );
}
