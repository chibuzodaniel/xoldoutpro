"use client";

import { usePathname, useRouter } from "next/navigation";
import { usePlayer } from "./PlayerProvider";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { ArtworkImage } from "@/components/ui/ArtworkImage";

export function MiniPlayer() {
  const { current, isPlaying, togglePlay, setExpanded, loading, owned, close } = usePlayer();
  const router = useRouter();
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  if (!current) return null;
  // Same reasoning as BottomNav: hide only while the keyboard is actually
  // open in a Fanbase group's chat, not on the route generally. The
  // underlying <audio> element lives in PlayerProvider, mounted at the app
  // root regardless of what renders here — hiding this purely visual bar
  // never touches playback, which keeps running the whole time.
  if (pathname?.startsWith("/groups/") && keyboardOpen) return null;

  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface px-3 py-2">
      {/* Bought songs open the vinyl player; a preview opens the song's page (2026-11-11). */}
      <button
        onClick={() => {
          if (owned) return setExpanded(true);
          if (current.productId) router.push(`/${current.kind === "beat" ? "b" : "r"}/${current.productId}`);
        }}
        className="flex items-center gap-3 flex-1 min-w-0 text-left"
      >
        <div className="relative h-9 w-9 rounded bg-surface-2 shrink-0 overflow-hidden">
          {/* Already a ladder rung (lib/images.ts) — see ProductCard for why `unoptimized`. */}
          <ArtworkImage src={current.artworkUrl} alt={current.title} sizes="36px" unoptimized className="object-cover" />
          {/* Small brand watermark on the artwork corner — the mini bar has
              no spare vertical room for a "Playing from XOLDOUT" text line
              (it's persistent across every screen), unlike the expanded
              player and lock screen, which both show that in full. */}
          <span className="absolute bottom-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-tl bg-black/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/xoldout-icon-transparent.png" alt="" className="h-2.5 w-2.5" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold line-clamp-1">{current.title}</p>
          <p className="text-[11px] text-ink-3 line-clamp-1">{current.artistName}</p>
        </div>
      </button>
      <button onClick={togglePlay} className="text-lg text-white px-2" aria-label={isPlaying ? "Pause" : "Play"}>
        {loading ? "…" : isPlaying ? "❚❚" : "▶"}
      </button>
      {/* Stop and hide the bar (explicit ask, 2026-11-11). */}
      <button onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:text-ink" aria-label="Close player">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
