"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePlayer } from "@/components/player/PlayerProvider";
import { useAuth } from "@/components/auth/AuthProvider";

type Props = {
  productId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  durationSec: number;
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

// Beats go through the shared app-wide PlayerProvider/mini-player, same as
// Release tracks (PlayerProvider.play() accepts kind:"beat" and fetches
// /api/beats/[id]/audio-url instead of the track route) — this is what
// makes a beat preview survive a route change into the mini player like
// Release playback already does.
export function BeatPurchaseAndPlayer({ productId, title, artistName, artworkUrl, durationSec, priceKobo, isSoldOut }: Props) {
  const router = useRouter();
  const player = usePlayer();
  const { firebaseUser } = useAuth();
  const [entitled, setEntitled] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gifting, setGifting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isThisTrack = player.current?.trackId === productId && player.current?.kind === "beat";
  const isPlaying = isThisTrack && player.isPlaying;
  const loadingAudio = isThisTrack && player.loading;

  async function loadAccess() {
    const res = await apiFetch(`/api/beats/${productId}/access`);
    if (!res.ok) return;
    const data = await res.json();
    setEntitled(data.entitled);
    setIsOwner(data.isOwner);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    loadAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function handleTogglePlay() {
    if (isThisTrack) {
      player.togglePlay();
      return;
    }
    player.play({ trackId: productId, title, artistName, artworkUrl, lyricsText: null, kind: "beat" });
  }

  async function handleDownload() {
    setError(null);
    try {
      const res = await apiFetch(`/api/beats/${productId}/audio-url`);
      if (!res.ok) throw new Error("Could not get download link");
      const data = await res.json();
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

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
        await loadAccess();
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

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
        <button
          onClick={handleTogglePlay}
          disabled={loadingAudio}
          className="h-9 w-9 rounded-full bg-red flex items-center justify-center shrink-0 disabled:opacity-50"
          aria-label={isPlaying ? "Pause" : "Play preview"}
        >
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
        </button>
        <span className="flex-1 text-sm text-ink-2 px-3">{entitled || isOwner ? "Full beat" : "Preview"}</span>
        <span className="text-xs text-ink-3">{formatTime(durationSec)}</span>
      </div>

      {(entitled || isOwner) && (
        <div className="mt-4">
          <button
            onClick={handleDownload}
            className="w-full rounded-lg border border-line px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
              <path d="M12 3v13m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 20h14" strokeLinecap="round" />
            </svg>
            Download
          </button>
          {entitled && <p className="text-[11px] text-green mt-3">You own this beat, licensed for commercial use.</p>}
        </div>
      )}
    </div>
  );
}
