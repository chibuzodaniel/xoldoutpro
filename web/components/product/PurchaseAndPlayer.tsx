"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { usePlayer, type PlayableTrack } from "@/components/player/PlayerProvider";
import { useAuth } from "@/components/auth/AuthProvider";

type AccessTrack = {
  id: string;
  title: string;
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

  function handlePlay(track: AccessTrack) {
    const trackQueue: PlayableTrack[] = (tracks ?? []).map((t) => ({
      trackId: t.id,
      title: t.title,
      artistName,
      artworkUrl,
      lyricsText: t.lyricsText,
    }));
    player.play({ trackId: track.id, title: track.title, artistName, artworkUrl, lyricsText: track.lyricsText }, trackQueue);
  }

  return (
    <div>
      {!entitled && !isOwner && (
        <button
          onClick={handleBuy}
          disabled={busy || isSoldOut}
          className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 mb-4"
        >
          {isSoldOut ? "Sold out" : busy ? "Starting checkout…" : formatNaira(priceKobo)}
        </button>
      )}
      {error && <p className="text-sm text-red-soft mb-3">{error}</p>}

      <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
        {(tracks ?? []).map((track, i) => (
          <button key={track.id} onClick={() => handlePlay(track)} className="flex items-center justify-between py-3 text-left">
            <span className="text-sm">
              <span className="text-ink-3 mr-2">{i + 1}.</span>
              {track.title}
              {!entitled && !isOwner && (
                <span className="ml-2 text-[10px] text-ink-3 uppercase tracking-widest">Preview</span>
              )}
            </span>
            <span className="text-xs text-ink-3">
              {entitled || isOwner ? formatTime(track.durationSec) : formatTime(track.previewEndSec - track.previewStartSec)}
            </span>
          </button>
        ))}
      </div>

      {entitled && (
        <p className="text-[11px] text-green mt-4">
          You own this. Playable offline once downloaded to your Library.
        </p>
      )}
    </div>
  );
}
