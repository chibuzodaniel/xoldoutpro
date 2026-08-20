"use client";

import { useState } from "react";
import { usePlayer } from "./PlayerProvider";

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Static pattern, not audio-reactive — same decorative role the bars play in
// the reference design. Only actually moves (via the waveform-bar keyframe
// in globals.css) while isPlaying is true, so it's not claiming to be real
// visualization, just an animated "something is playing" cue.
const WAVEFORM_HEIGHTS = [35, 60, 90, 50, 75, 100, 65, 40, 80, 55, 95, 45, 70, 100, 60, 35, 85, 50, 75, 40];

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

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 11V9a4 4 0 014-4h14" strokeLinecap="round" />
      <path d="M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 13v2a4 4 0 01-4 4H3" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon({ level }: { level: "low" | "high" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 9v6h4l5 4V5L7 9H3z" strokeLinejoin="round" strokeLinecap="round" />
      {level === "high" && <path d="M16.5 8.5a5 5 0 010 7" strokeLinecap="round" />}
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
    expanded,
    entitled,
    previewStartSec,
    previewEndSec,
    queue,
    queueIndex,
    volume,
    remoteSupported,
    play,
    togglePlay,
    seek,
    cycleRepeat,
    setExpanded,
    next,
    previous,
    setVolume,
    requestRemotePlayback,
  } = usePlayer();

  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [shareLabel, setShareLabel] = useState<"idle" | "copied">("idle");
  const [mutedVolume, setMutedVolume] = useState<number | null>(null);

  if (!expanded || !current) return null;

  const seekMin = !entitled && previewStartSec !== null ? previewStartSec : 0;
  const seekMax = !entitled && previewEndSec !== null ? previewEndSec : durationSec || 100;
  const hasNext = queueIndex < queue.length - 1;
  const trackLengthSec = entitled ? durationSec : seekMax - seekMin;
  const remainingSec = Math.max((entitled ? durationSec : seekMax) - positionSec, 0);

  async function handleShare() {
    const text = `${current!.title} — ${current!.artistName} on XOLDOUT`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: current!.title, text });
      } catch {
        // user dismissed the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareLabel("copied");
      setTimeout(() => setShareLabel("idle"), 1500);
    } catch {
      // clipboard unavailable — silently give up
    }
  }

  function handleToggleMute() {
    if (volume > 0) {
      setMutedVolume(volume);
      setVolume(0);
    } else {
      setVolume(mutedVolume ?? 1);
      setMutedVolume(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <div className="flex items-center justify-between px-4 h-12 shrink-0">
        <button onClick={() => setExpanded(false)} className="text-2xl text-ink-2 w-8" aria-label="Minimize">
          ‹
        </button>
        <span className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Playing in XOLDOUT</span>
        <button onClick={handleShare} className="w-8 flex justify-end text-ink-2" aria-label="Share">
          {shareLabel === "copied" ? <span className="text-[11px] text-ink-3">Copied</span> : <ShareIcon />}
        </button>
      </div>

      <div className="flex-1 flex flex-col px-6 pb-8 overflow-y-auto">
        <div className="relative aspect-square w-full max-w-sm mx-auto rounded-2xl bg-surface-2 overflow-hidden mb-6">
          {current.artworkUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.artworkUrl} alt={current.title} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-x-0 bottom-4 flex items-end justify-center gap-[3px] h-5">
            {WAVEFORM_HEIGHTS.map((h, i) => (
              <span
                key={i}
                className={`w-[3px] rounded-full bg-white/80 origin-bottom ${isPlaying ? "animate-waveform-bar" : ""}`}
                style={{ height: `${h}%`, animationDelay: `${i * 0.07}s` }}
              />
            ))}
          </div>
        </div>

        <div className="max-w-sm mx-auto w-full">
          <h1 className="font-serif text-2xl mb-1">{current.title}</h1>
          <p className="text-sm text-ink-3 mb-5">
            {current.artistName} · {formatTime(trackLengthSec)}
          </p>

          {!entitled && previewStartSec !== null && previewEndSec !== null && (
            <p className="text-[12px] text-red-soft mb-3">
              Preview only — {formatTime(previewStartSec)} to {formatTime(previewEndSec)}. Buy to hear the rest.
            </p>
          )}

          <input
            type="range"
            min={seekMin}
            max={seekMax}
            step={0.1}
            value={Math.min(Math.max(positionSec, seekMin), seekMax)}
            onChange={(e) => seek(Number(e.target.value))}
            className="w-full h-1 accent-red mb-1"
          />
          <div className="flex justify-between text-[11px] text-ink-3 mb-6">
            <span>{formatTime(positionSec)}</span>
            <span>-{formatTime(remainingSec)}</span>
          </div>

          {/* Previous/Play/Next form the true centered triad (equal flex-1
              spacers on each side); Repeat sits apart at the trailing edge,
              matching the standard player layout — a plain 4-up justify-between
              row visually off-centers Play since its circle is much larger
              than the other icons. */}
          <div className="flex items-center mb-8 px-1">
            <div className="flex-1" />
            <div className="flex items-center gap-8">
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
            </div>
            <div className="flex-1 flex justify-end">
              <button
                onClick={cycleRepeat}
                className={repeatMode !== "off" ? "text-red-soft" : "text-ink-2"}
                aria-label={`Repeat: ${repeatMode}`}
              >
                <RepeatIcon />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <button onClick={handleToggleMute} className="text-ink-3 shrink-0" aria-label={volume === 0 ? "Unmute" : "Mute"}>
              <SpeakerIcon level="low" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="flex-1 h-1 accent-ink"
              aria-label="Volume"
            />
            <button onClick={() => setVolume(1)} className="text-ink-3 shrink-0" aria-label="Max volume">
              <SpeakerIcon level="high" />
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
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
