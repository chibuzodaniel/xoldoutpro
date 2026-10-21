"use client";

import { FallbackImg } from "@/components/ui/FallbackImg";

// The vinyl player's record (explicit ask, 2026-10-21: "vinyl feeling with
// the rotating disc"). The cover is the record's label; grooved black vinyl
// rims it. Only the record turns — the sheen is a separate, still layer on
// top, which is what makes it read as light on a spinning disc.
export function VinylDisc({ artworkUrl, title, spinning }: { artworkUrl: string | null; title: string; spinning: boolean }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px]">
      <div
        className="animate-vinyl-spin absolute inset-0 rounded-full shadow-[0_18px_50px_rgba(0,0,0,0.65)]"
        style={{
          animationPlayState: spinning ? "running" : "paused",
          background:
            "repeating-radial-gradient(circle at 50% 50%, #0d0d0f 0px, #0d0d0f 2px, #222227 2.5px, #0d0d0f 3.5px), #0d0d0f",
        }}
      >
        <div className="absolute inset-[7%] rounded-full overflow-hidden bg-surface-2 ring-1 ring-black/60">
          <FallbackImg src={artworkUrl} alt={title} className="h-full w-full object-cover" fallback={null} />
        </div>
        {/* Spindle hole */}
        <div className="absolute left-1/2 top-1/2 h-[5%] w-[5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-bg ring-2 ring-black/50" />
      </div>
      {/* Still sheen over the turning record */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 210deg, transparent 0deg, rgba(255,255,255,0.10) 30deg, transparent 70deg, transparent 180deg, rgba(255,255,255,0.06) 215deg, transparent 255deg)",
        }}
      />
    </div>
  );
}
