"use client";

import { usePlayer, type PlayableTrack } from "@/components/player/PlayerProvider";

// The white play button on a product page's artwork (design/v2-prototype).
// Plays the first track's preview (or the beat) through the shared player —
// the same thing tapping the first row of the track list does.
export function HeroPlayButton({ track, queue }: { track: PlayableTrack; queue?: PlayableTrack[] }) {
  const player = usePlayer();
  const isThis = player.current?.trackId === track.trackId;
  const playing = isThis && player.isPlaying;
  return (
    <button
      type="button"
      onClick={() => (isThis ? player.togglePlay() : player.play(track, queue))}
      aria-label={playing ? `Pause ${track.title}` : `Play ${track.title}`}
      className="absolute bottom-4 right-4 flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl"
    >
      {playing ? (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-[1px]" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
