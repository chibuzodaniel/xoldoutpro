"use client";

import { usePlayer } from "./PlayerProvider";

export function MiniPlayer() {
  const { current, isPlaying, togglePlay, setExpanded, loading } = usePlayer();
  if (!current) return null;

  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface px-3 py-2">
      <button onClick={() => setExpanded(true)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className="h-9 w-9 rounded bg-surface-2 shrink-0 overflow-hidden">
          {current.artworkUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.artworkUrl} alt={current.title} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold line-clamp-1">{current.title}</p>
          <p className="text-[10px] text-ink-3 line-clamp-1">{current.artistName}</p>
        </div>
      </button>
      <button onClick={togglePlay} className="text-lg text-white px-2" aria-label={isPlaying ? "Pause" : "Play"}>
        {loading ? "…" : isPlaying ? "❚❚" : "▶"}
      </button>
    </div>
  );
}
