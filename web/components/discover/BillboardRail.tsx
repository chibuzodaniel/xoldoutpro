"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type BillboardSlide = {
  id: string;
  artworkUrl: string;
  creator: { handle: string; displayName: string } | null;
};

const ROTATE_MS = 5000;

/**
 * Rotating promo rail (explicit ask: "it should be switching to different"),
 * fed by app/(app)/discover/page.tsx's server-side getActiveBillboards()
 * call. A plain setInterval + CSS opacity crossfade — no carousel library,
 * matching this codebase's general "no new dependency for something this
 * simple" pattern (see e.g. the ID3-tagging work's own ffmpeg-static reuse).
 *
 * No outer <section>/padding of its own (explicit ask, with a reference
 * screenshot): this renders nested inside the New Release row's own left
 * column, directly below the release grid, so it reads as part of that same
 * block — with the Top sellers rail alongside stretching to match the
 * combined height (see that section's own "items-stretch" comment).
 * Portrait (4:5, taller than a plain square — explicit ask), not a wide banner.
 */
export function BillboardRail({ slides }: { slides: BillboardSlide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <div>
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-3 mb-1.5 leading-tight">Billboards</p>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-surface">
        {slides.map((slide, i) => {
          const inner = (
            // eslint-disable-next-line @next/next/no-img-element -- remote R2 artwork, arbitrary aspect ratio
            <img src={slide.artworkUrl} alt={slide.creator ? `${slide.creator.displayName}'s billboard` : "Billboard"} className="h-full w-full object-cover" />
          );
          return (
            <div
              key={slide.id}
              className="absolute inset-0 transition-opacity duration-700"
              style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? "auto" : "none" }}
            >
              {slide.creator ? <Link href={`/u/${slide.creator.handle}`}>{inner}</Link> : inner}
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {slides.map((slide, i) => (
            <span
              key={slide.id}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-red-soft" : "bg-line-strong"}`}
              aria-hidden
            />
          ))}
        </div>
      )}
    </div>
  );
}
