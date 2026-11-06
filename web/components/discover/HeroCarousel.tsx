"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { Price } from "@/components/currency/CurrencyProvider";

// Discover hero as a billboard (explicit ask, 2026-11-04): the week's top 3
// sellers, swiping automatically every few seconds, with dots. No play
// button — the whole card opens the release. Pure client timer, no fetching.

export type HeroSlide = {
  weeklySold: number;
  /** All-time copies sold — set when the slide fills in for a week with fewer than 3 sellers. */
  totalSold?: number;
  product: {
    id: string;
    title: string;
    priceKobo: number;
    creator: { displayName: string };
    release: { artworkLadder: unknown; releaseType: string } | null;
    stockPolicy: { cap: number | null; sold: number; soldOutAt: Date | string | null } | null;
  };
};

const INTERVAL_MS = 5000;

function badgeLabel(weeklySold: number, totalSold: number, rank: number | null) {
  const prefix = rank ? `#${rank} ` : "";
  if (weeklySold > 0) return `${prefix}Top Seller This Week`;
  if (totalSold > 0) return `${prefix}Top Seller`;
  return "New Release";
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  // Keep the dots in step with manual swipes.
  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  }

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const el = trackRef.current;
      if (!el) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % slides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
      setIndex(next);
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  return (
    <div
      className="relative mx-4 mb-6 rounded-xl overflow-hidden aspect-[4/5]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setTimeout(() => setPaused(false), INTERVAL_MS)}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex h-full w-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map(({ product: p, weeklySold, totalSold = 0 }, i) => {
          const art = (p.release?.artworkLadder as Record<string, string> | undefined)?.["1024"] ?? null;
          const cap = p.stockPolicy?.cap ?? null;
          const sold = p.stockPolicy?.sold ?? 0;
          const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
          return (
            <Link key={p.id} href={`/r/${p.id}`} className="relative block h-full w-full shrink-0 snap-start" aria-label={`${p.title} by ${p.creator.displayName}`}>
              <div className="absolute inset-0 bg-surface-2">
                <FallbackImg src={art} alt={p.title} className="h-full w-full object-cover" fallback={null} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-black/40" />

              <span className="absolute left-3 top-3 rounded-full bg-black/50 backdrop-blur-sm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                {(p.release?.releaseType ?? "single").toLowerCase()}
              </span>
              <span className="absolute left-3 top-10 rounded-full bg-red px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                {badgeLabel(weeklySold, totalSold, slides.length > 1 ? i + 1 : null)}
              </span>

              <div className="absolute left-4 right-4 bottom-9">
                <p className="text-[12px] text-white/90 uppercase tracking-wide mb-1">{p.creator.displayName}</p>
                <h2 className="font-serif text-2xl text-white leading-tight mb-2 line-clamp-2">{p.title}</h2>
                <div className="flex items-center justify-between">
                  {remaining !== null ? (
                    <span className="text-xs font-semibold text-red-soft">{p.stockPolicy?.soldOutAt ? "Sold out" : `${remaining} of ${cap} left`}</span>
                  ) : weeklySold > 0 ? (
                    <span className="text-xs font-semibold text-red-soft">{weeklySold} sold this week</span>
                  ) : totalSold > 0 ? (
                    <span className="text-xs font-semibold text-red-soft">{totalSold} sold</span>
                  ) : (
                    <span className="text-xs text-white/90">{sold} sold</span>
                  )}
                  <span className="font-serif text-lg text-white">
                    <Price kobo={p.priceKobo} freeLabel="Free" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.product.id}
              onClick={() => goTo(i)}
              aria-label={`Show top seller ${i + 1}`}
              aria-current={i === index}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-white" : "w-1.5 bg-white/45"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
