"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BillboardSlideData } from "@/lib/commerce/billboards";

export type BillboardSlide = BillboardSlideData;

const ROTATE_MS = 5000;
// Batched: one beacon a minute per viewer (plus on page hide), not one per
// impression — every beacon is a Vercel function invocation.
const FLUSH_MS = 60000;

const KIND_LABEL: Record<string, string> = { RELEASE: "Song", BEAT: "Beat", MERCH: "Merch", EVENT: "Event" };

function compactCount(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function sendViews(counts: Record<string, number>) {
  if (Object.keys(counts).length === 0) return;
  const body = JSON.stringify({ counts });
  try {
    if (navigator.sendBeacon?.("/api/billboards/views", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  fetch("/api/billboards/views", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
}

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
 *
 * View counts (explicit ask: "anytime a user sees it should count, not just
 * a one time view"): every time a slide is actually shown — on rotation, or
 * when the rail scrolls into view — is one impression. Only counted while
 * the rail is at least half on screen and the tab is visible, so a
 * backgrounded tab rotating all afternoon doesn't inflate anything.
 * Impressions are batched and flushed every 60s and on page hide.
 */
export function BillboardRail({ slides }: { slides: BillboardSlide[] }) {
  const [index, setIndex] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  const [localViews, setLocalViews] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<Record<string, number>>({});

  const flush = useCallback(() => {
    const counts = pendingRef.current;
    pendingRef.current = {};
    sendViews(counts);
  }, []);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // One impression per (slide shown × while on screen and tab visible).
  const currentId = slides[index]?.id;
  useEffect(() => {
    if (!currentId || !onScreen || document.visibilityState !== "visible") return;
    pendingRef.current[currentId] = (pendingRef.current[currentId] ?? 0) + 1;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- optimistic bump of the on-screen count for the impression just recorded
    setLocalViews((v) => ({ ...v, [currentId]: (v[currentId] ?? 0) + 1 }));
  }, [currentId, onScreen]);

  useEffect(() => {
    const id = setInterval(flush, FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  if (slides.length === 0) return null;

  return (
    <div ref={containerRef}>
      <p className="text-[9.5px] font-semibold uppercase tracking-wide text-ink-3 mb-1.5 leading-tight">Billboards</p>
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-surface">
        {slides.map((slide, i) => {
          const views = slide.viewCount + (localViews[slide.id] ?? 0);
          const promoted = slide.target && slide.target.kind !== "PROFILE" ? slide.target : null;
          const inner = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote R2 artwork, arbitrary aspect ratio */}
              <img src={slide.artworkUrl} alt={slide.creator ? `${slide.creator.displayName}'s billboard` : "Billboard"} className="h-full w-full object-cover" />
              <span
                className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
                title={`${views.toLocaleString("en-NG")} views`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden>
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                {compactCount(views)}
                <span className="sr-only"> views</span>
              </span>
              {promoted && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-left">
                  <span className="block text-[9px] font-bold uppercase tracking-wide text-red-soft">{KIND_LABEL[promoted.kind]}</span>
                  <span className="block truncate text-[11px] font-semibold text-white">{promoted.title}</span>
                </span>
              )}
            </>
          );
          return (
            <div
              key={slide.id}
              className="absolute inset-0 transition-opacity duration-700"
              style={{ opacity: i === index ? 1 : 0, pointerEvents: i === index ? "auto" : "none" }}
            >
              {slide.href ? (
                <Link href={slide.href} className="block h-full w-full">
                  {inner}
                </Link>
              ) : (
                inner
              )}
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
