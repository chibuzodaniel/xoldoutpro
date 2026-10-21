"use client";

import { useEffect, useRef, useState } from "react";
import type { WaveformSource } from "./PlayerProvider";

const BAR_COUNT = 64;

// Peaks per track for the life of the page — the signed URL changes on every
// play, the waveform doesn't.
const peaksCache = new Map<string, number[]>();

function downsample(peaks: number[], startFrac = 0, endFrac = 1): number[] {
  const from = Math.floor(peaks.length * startFrac);
  const to = Math.max(from + 1, Math.ceil(peaks.length * endFrac));
  const slice = peaks.slice(from, to);
  const step = slice.length / BAR_COUNT;
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    let max = 0;
    for (let j = Math.floor(i * step); j < Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1) && j < slice.length; j++) {
      max = Math.max(max, slice[j]);
    }
    bars.push(max);
  }
  const top = Math.max(...bars, 0.0001);
  return bars.map((b) => Math.max(0.08, b / top));
}

/** Stand-in shape (offline, or a track without stored peaks) — stable per track, not random per render. */
function placeholderBars(seed: string): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    const wave = 0.55 + 0.35 * Math.sin(i / 5);
    return Math.max(0.12, Math.min(1, wave * (0.6 + (h % 1000) / 2500)));
  });
}

function useBars(trackId: string, source: WaveformSource | null) {
  const [bars, setBars] = useState<number[]>(() => placeholderBars(trackId));
  useEffect(() => {
    let cancelled = false;
    const fallback = placeholderBars(trackId);
    if (!source || source.trackId !== trackId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting to this track's stand-in shape
      setBars(fallback);
      return;
    }
    const apply = (peaks: number[]) => !cancelled && setBars(downsample(peaks, source.startFrac, source.endFrac));
    const cached = peaksCache.get(trackId);
    if (cached) {
      apply(cached);
    } else {
      setBars(fallback);
      fetch(source.url)
        .then((r) => (r.ok ? r.json() : null))
        .then((peaks: unknown) => {
          if (Array.isArray(peaks) && peaks.length > 0) {
            peaksCache.set(trackId, peaks as number[]);
            apply(peaks as number[]);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [trackId, source]);
  return bars;
}

// The vinyl player's scrubber: the track's real waveform (played bars
// bright, the rest dim) with a thin red playhead. Tap or drag anywhere to
// seek; arrow keys step 5s for keyboard users.
export function WaveformScrubber({
  trackId,
  source,
  progress,
  onSeekFraction,
}: {
  trackId: string;
  source: WaveformSource | null;
  progress: number;
  onSeekFraction: (fraction: number) => void;
}) {
  const bars = useBars(trackId, source);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const clamped = Math.min(Math.max(progress, 0), 1);

  function fractionAt(clientX: number) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return clamped;
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onSeekFraction(fractionAt(e.clientX));
      }}
      onPointerMove={(e) => dragging.current && onSeekFraction(fractionAt(e.clientX))}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeekFraction(Math.min(1, clamped + 0.03));
        if (e.key === "ArrowLeft") onSeekFraction(Math.max(0, clamped - 0.03));
      }}
      className="relative flex h-14 w-full cursor-pointer touch-none select-none items-center gap-[2px] outline-none"
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className={`flex-1 rounded-full transition-colors duration-150 ${(i + 0.5) / bars.length <= clamped ? "bg-white" : "bg-white/30"}`}
          style={{ height: `${Math.round(h * 100)}%` }}
        />
      ))}
      <span className="pointer-events-none absolute inset-y-0 w-[2px] rounded-full bg-red-soft" style={{ left: `calc(${clamped * 100}% - 1px)` }} />
    </div>
  );
}
