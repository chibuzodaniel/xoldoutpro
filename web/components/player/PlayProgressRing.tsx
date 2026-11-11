"use client";

import { usePlayer } from "@/components/player/PlayerProvider";

// Dynamic play buttons (explicit ask, 2026-11-11: "preview should just be a
// play button that is dynamic"): drawn over a round play button, a ring that
// fills as this track plays (through the preview window for a preview) and
// spins while it loads. Reads the player's existing position — no extra timers.
export function PlayProgressRing({ trackId, color = "#E10B2C" }: { trackId: string; color?: string }) {
  const { current, positionSec, durationSec, previewStartSec, previewEndSec, entitled, loading } = usePlayer();
  if (current?.trackId !== trackId) return null;

  const start = !entitled && previewStartSec !== null ? previewStartSec : 0;
  const end = !entitled && previewEndSec !== null ? previewEndSec : durationSec;
  const span = Math.max(end - start, 0.001);
  const progress = loading ? 0.25 : Math.min(Math.max((positionSec - start) / span, 0), 1);
  const r = 46;
  const c = 2 * Math.PI * r;

  return (
    <svg viewBox="0 0 100 100" className={`pointer-events-none absolute -inset-[3px] -rotate-90 ${loading ? "animate-spin" : ""}`} aria-hidden>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - progress)}
        style={{ transition: loading ? undefined : "stroke-dashoffset 0.25s linear" }}
      />
    </svg>
  );
}
