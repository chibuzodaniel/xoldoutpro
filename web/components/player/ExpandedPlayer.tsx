"use client";

import { usePlayer } from "./PlayerProvider";

function formatTime(sec: number) {
  if (!Number.isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
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
    togglePlay,
    seek,
    cycleRepeat,
    setExpanded,
  } = usePlayer();

  if (!expanded || !current) return null;

  const seekMin = !entitled && previewStartSec !== null ? previewStartSec : 0;
  const seekMax = !entitled && previewEndSec !== null ? previewEndSec : durationSec || 100;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg">
      <div className="flex items-center gap-3 px-4 h-12 shrink-0">
        <button onClick={() => setExpanded(false)} className="text-xl text-ink-2">
          ⌄
        </button>
        <span className="text-xs text-ink-3 uppercase tracking-widest">Now Playing</span>
      </div>

      <div className="flex-1 flex flex-col px-6 pb-8 overflow-y-auto">
        <div className="aspect-square w-full max-w-sm mx-auto rounded-lg bg-surface-2 overflow-hidden mb-6">
          {current.artworkUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.artworkUrl} alt={current.title} className="h-full w-full object-cover" />
          )}
        </div>

        <div className="max-w-sm mx-auto w-full">
          <h1 className="font-serif text-xl">{current.title}</h1>
          <p className="text-sm text-ink-3 mb-5">{current.artistName}</p>

          {!entitled && previewStartSec !== null && previewEndSec !== null && (
            <p className="text-[11px] text-red-soft mb-3">
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
            className="w-full accent-red mb-1"
          />
          <div className="flex justify-between text-[10px] text-ink-3 mb-6">
            <span>{formatTime(positionSec)}</span>
            <span>{formatTime(entitled ? durationSec : seekMax)}</span>
          </div>

          <div className="flex items-center justify-center gap-8 mb-8">
            <button
              onClick={cycleRepeat}
              className={`text-xs font-semibold ${repeatMode !== "off" ? "text-red-soft" : "text-ink-3"}`}
              aria-label="Toggle repeat"
            >
              {repeatMode === "one" ? "REPEAT 1" : repeatMode === "all" ? "REPEAT" : "REPEAT OFF"}
            </button>
            <button
              onClick={togglePlay}
              className="h-14 w-14 rounded-full bg-red text-white flex items-center justify-center text-xl"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <span className="w-16" />
          </div>

          {current.lyricsText && (
            <div className="text-center font-serif text-ink-2 leading-relaxed whitespace-pre-line">
              {current.lyricsText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
