"use client";

import { useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { VinylDisc } from "./VinylDisc";
import { WaveformScrubber } from "./WaveformScrubber";

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 00:40 — the vinyl player's clock style. */
function formatClock(sec: number) {
  const safe = Number.isFinite(sec) ? Math.max(0, sec) : 0;
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PreviousIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" stroke="none">
      <rect x="4" y="5" width="2.2" height="14" rx="1" />
      <path d="M19 5.5v13a1 1 0 01-1.53.85l-9-6.5a1 1 0 010-1.7l9-6.5A1 1 0 0119 5.5z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" stroke="none">
      <rect x="17.8" y="5" width="2.2" height="14" rx="1" />
      <path d="M5 5.5v13a1 1 0 001.53.85l9-6.5a1 1 0 000-1.7l-9-6.5A1 1 0 005 5.5z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-[1px]" fill="currentColor" stroke="none">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" stroke="none">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

// A small "1" badge on repeat-one, same as Spotify/Apple Music — otherwise
// the icon looks identical whether it's repeating just this track or the
// whole album/EP/playlist, and the only difference (icon color) is easy to
// miss, especially since off/all/one all reuse the exact same glyph.
function RepeatIcon({ mode }: { mode: "one" | "other" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9a4 4 0 014-4h14" strokeLinecap="round" />
      <path d="M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13v2a4 4 0 01-4 4H3" strokeLinecap="round" />
      {mode === "one" && (
        <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="700" stroke="none" fill="currentColor">
          1
        </text>
      )}
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 6h3.5a4 4 0 013.2 1.6l6.6 8.8A4 4 0 0019.5 18H21" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 4l4 2-4 2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 18h3.5a4 4 0 003.2-1.6l.7-.93" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 7.53l.7-.93A4 4 0 0118.5 5H21" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 20l4-2-4-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function CastIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="13" y="3" width="8" height="14" rx="1.5" />
      <path d="M3 16v3a1 1 0 001 1h3" strokeLinecap="round" />
      <path d="M3 12a8 8 0 018 8" strokeLinecap="round" />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h10M4 11h10M4 16h6" strokeLinecap="round" />
      <circle cx="18" cy="16.5" r="2.3" />
      <path d="M20.3 16.5V7" strokeLinecap="round" />
    </svg>
  );
}

export function ExpandedPlayer() {
  const {
    current,
    isPlaying,
    positionSec,
    durationSec,
    repeatMode,
    shuffled,
    expanded,
    entitled,
    previewStartSec,
    previewEndSec,
    waveformSource,
    queue,
    queueIndex,
    remoteSupported,
    play,
    togglePlay,
    seek,
    cycleRepeat,
    toggleShuffle,
    setExpanded,
    next,
    previous,
    requestRemotePlayback,
  } = usePlayer();

  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [shareLabel, setShareLabel] = useState<"idle" | "copied">("idle");

  if (!expanded || !current) return null;

  const seekMin = !entitled && previewStartSec !== null ? previewStartSec : 0;
  const seekMax = !entitled && previewEndSec !== null ? previewEndSec : durationSec || 100;
  // At the last track, Next is still usable when repeat-all will wrap it
  // back to the first track (matches next()'s own repeat-all handling).
  const hasNext = queueIndex < queue.length - 1 || (repeatMode === "all" && queue.length > 0);
  const trackLengthSec = entitled ? durationSec : seekMax - seekMin;
  const span = Math.max(seekMax - seekMin, 0.001);
  const progress = (Math.min(Math.max(positionSec, seekMin), seekMax) - seekMin) / span;
  const elapsedSec = Math.max(0, Math.min(positionSec, seekMax) - seekMin);

  async function handleShare() {
    const text = `${current!.title} — ${current!.artistName} on XOLDOUT`;
    const url = current!.productId
      ? `${window.location.origin}/${current!.kind === "beat" ? "b" : "r"}/${current!.productId}`
      : undefined;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: current!.title, text, url });
      } catch {
        // user dismissed the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
      setShareLabel("copied");
      setTimeout(() => setShareLabel("idle"), 1500);
    } catch {
      // clipboard unavailable — silently give up
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <div className="flex items-center justify-between px-4 h-12 shrink-0">
        <button onClick={() => setExpanded(false)} className="text-2xl text-ink-2 w-8" aria-label="Minimize">
          ‹
        </button>
        <span className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Playing from XOLDOUT</span>
        <span className="w-8" aria-hidden />
      </div>

      <div className="flex-1 flex flex-col px-6 pb-8 overflow-y-auto">
        <div className="max-w-sm mx-auto w-full text-center mb-6">
          <h1 className="text-lg font-bold uppercase tracking-wide line-clamp-2">{current.title}</h1>
          <p className="text-sm text-ink-3">
            {current.artistName} · {formatTime(trackLengthSec)}
          </p>
        </div>

        {/* Vinyl redesign (explicit ask, 2026-10-21) — the record spins while playing. */}
        <div className="mb-8">
          <VinylDisc artworkUrl={current.artworkUrl} title={current.title} spinning={isPlaying} />
        </div>

        <div className="max-w-sm mx-auto w-full">
          {!entitled && previewStartSec !== null && previewEndSec !== null && (
            <p className="text-[12px] text-red-soft mb-3 text-center">
              Preview only — {formatTime(previewStartSec)} to {formatTime(previewEndSec)}. Buy to hear the rest.
            </p>
          )}

          <WaveformScrubber
            trackId={current.trackId}
            source={waveformSource}
            progress={progress}
            onSeekFraction={(f) => seek(seekMin + f * span)}
          />
          <p className="text-center font-mono text-[13px] text-ink-2 mt-2 mb-7 tabular-nums">
            {formatClock(elapsedSec)} / {formatClock(trackLengthSec)}
          </p>

          {/* Share · Previous · Play · Next · Repeat — the reference's one-row layout. */}
          <div className="flex items-center justify-between mb-8 px-1">
            <button onClick={handleShare} className="text-ink-2 w-8 flex justify-start" aria-label="Share">
              {shareLabel === "copied" ? <span className="text-[11px] text-ink-3">Copied</span> : <ShareIcon />}
            </button>
            <button onClick={previous} className="text-ink-2" aria-label="Previous">
              <PreviousIcon />
            </button>
            <button
              onClick={togglePlay}
              className="h-16 w-16 rounded-full bg-ink text-bg flex items-center justify-center"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button onClick={next} disabled={!hasNext} className="text-ink-2 disabled:opacity-30" aria-label="Next">
              <NextIcon />
            </button>
            <button
              onClick={cycleRepeat}
              className={`w-8 flex justify-end ${repeatMode !== "off" ? "text-red-soft" : "text-ink-2"}`}
              aria-label={`Repeat: ${repeatMode}`}
            >
              <RepeatIcon mode={repeatMode === "one" ? "one" : "other"} />
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <button
              onClick={toggleShuffle}
              disabled={queue.length < 2}
              className={`disabled:opacity-30 ${shuffled ? "text-red-soft" : "text-ink-3"}`}
              aria-label={shuffled ? "Shuffle: on" : "Shuffle: off"}
              aria-pressed={shuffled}
            >
              <ShuffleIcon />
            </button>
            <button
              onClick={() => setShowLyrics((v) => !v)}
              disabled={!current.lyricsText}
              className={`disabled:opacity-30 ${showLyrics ? "text-red-soft" : "text-ink-2"}`}
              aria-label="Lyrics"
            >
              <CommentIcon />
            </button>
            {remoteSupported && (
              <button onClick={requestRemotePlayback} className="text-ink-2" aria-label="Play on another device">
                <CastIcon />
              </button>
            )}
            <button
              onClick={() => setShowQueue((v) => !v)}
              disabled={queue.length < 2}
              className={`disabled:opacity-30 ${showQueue ? "text-red-soft" : "text-ink-2"}`}
              aria-label="Queue"
            >
              <QueueIcon />
            </button>
          </div>

          {showLyrics && current.lyricsText && (
            <div className="text-center font-serif text-ink-2 leading-relaxed whitespace-pre-line mt-6">
              {current.lyricsText}
            </div>
          )}

          {showQueue && queue.length > 1 && (
            <div className="mt-6 flex flex-col divide-y divide-line-soft border-y border-line-soft">
              {queue.map((t, i) => (
                <button
                  key={t.trackId}
                  onClick={() => play(t, queue)}
                  className={`flex items-center justify-between py-3 text-left ${i === queueIndex ? "text-red-soft" : ""}`}
                >
                  <span className="text-sm">
                    <span className="text-ink-3 mr-2">{i + 1}.</span>
                    {t.title}
                  </span>
                  {i === queueIndex && <span className="text-[11px] uppercase tracking-widest">Now Playing</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
