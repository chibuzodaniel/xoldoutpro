"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBackToClose } from "@/lib/backNav";

// Merch photo gallery (explicit ask, 2026-11-11): the main photo crossfades
// left-to-right through every photo like the Discover billboards; swipe,
// dots or thumbnails switch photos; tapping opens a full-screen viewer with
// arrows, swipe and zoom (double-tap, pinch, or the zoom button; drag to pan).
// Plain <img> on purpose: the browser applies the phone's rotation (EXIF)
// itself, so raw uploads never show sideways.

const ROTATE_MS = 4000;
const SWIPE_PX = 40;

export function MerchGallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const count = images.length;

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  // Auto slideshow, paused while the viewer is open, after a manual change
  // (until the next tick), or while the tab is in the background.
  useEffect(() => {
    if (count < 2 || viewerOpen) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (paused) return setPaused(false);
      setIndex((i) => (i + 1) % count);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [count, viewerOpen, paused]);

  function manual(i: number) {
    setPaused(true);
    go(i);
  }

  return (
    <div className="px-4 pt-4 md:sticky md:top-4 md:self-start md:px-0">
      <div
        className="relative aspect-square w-full select-none overflow-hidden rounded-[28px] bg-gradient-to-br from-red/50 via-red-tint to-black"
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerUp={(e) => {
          const dx = startX.current === null ? 0 : e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > SWIPE_PX) manual(index + (dx < 0 ? 1 : -1));
          else setViewerOpen(true);
        }}
        role="button"
        aria-label={`View photos of ${title}`}
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- see the file comment (EXIF rotation)
          <img
            key={src}
            src={src}
            alt={i === index ? title : ""}
            draggable={false}
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${i === index ? "opacity-100" : "opacity-0"}`}
          />
        ))}
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white">
          {index + 1} / {count}
        </span>
      </div>

      {count > 1 && (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => manual(i)}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === index}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-2 transition ${i === index ? "ring-red" : "ring-transparent opacity-70"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- EXIF rotation */}
                <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-2" aria-hidden>
            {images.map((src, i) => (
              <span key={src} className={`h-2 rounded-full transition-all duration-300 ${i === index ? "w-6 bg-red" : "w-2 bg-white/30"}`} />
            ))}
          </div>
        </>
      )}

      {viewerOpen && <ImageViewer images={images} index={index} onIndex={go} onClose={() => setViewerOpen(false)} title={title} />}
    </div>
  );
}

function ImageViewer({ images, index, onIndex, onClose, title }: { images: string[]; index: number; onIndex: (i: number) => void; onClose: () => void; title: string }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  // Back / swipe-back closes the viewer (2026-11-13).
  useBackToClose(true, onClose);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startScale: number; startX: number; startY: number; startPan: { x: number; y: number }; moved: boolean } | null>(null);
  const lastTap = useRef(0);
  const [dragging, setDragging] = useState(false);
  const count = images.length;

  const reset = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);
  const step = useCallback(
    (d: number) => {
      reset();
      onIndex(index + d);
    },
    [index, onIndex, reset],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, step]);

  function dist() {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function onDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    gesture.current = { startDist: dist(), startScale: scale, startX: e.clientX, startY: e.clientY, startPan: pan, moved: false };
  }

  function onMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 2 && g.startDist > 0) {
      g.moved = true;
      setScale(Math.min(5, Math.max(1, g.startScale * (dist() / g.startDist))));
    } else if (pointers.current.size === 1 && scale > 1) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      setPan({ x: g.startPan.x + dx, y: g.startPan.y + dy });
    }
  }

  function onUp(e: React.PointerEvent) {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) {
      // One finger lifted after a pinch: restart from the remaining finger.
      const [p] = [...pointers.current.values()];
      gesture.current = { startDist: 0, startScale: scale, startX: p.x, startY: p.y, startPan: pan, moved: true };
      return;
    }
    gesture.current = null;
    setDragging(false);
    if (!g) return;
    const dx = e.clientX - g.startX;
    if (scale === 1 && !g.moved && Math.abs(dx) > SWIPE_PX) return step(dx < 0 ? 1 : -1);
    if (!g.moved && Math.abs(dx) <= SWIPE_PX) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (scale > 1) reset();
        else setScale(2.5);
      } else lastTap.current = now;
    }
    if (scale <= 1.02) reset();
  }

  const btn = "flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={`${title} photos`}>
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3">
        <span className="text-[14px] font-semibold text-white/80">
          {index + 1} / {count}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (scale > 1 ? reset() : setScale(2.5))} className={btn} aria-label={scale > 1 ? "Zoom out" : "Zoom in"}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4M8 11h6" strokeLinecap="round" />
              {scale === 1 && <path d="M11 8v6" strokeLinecap="round" />}
            </svg>
          </button>
          <button type="button" onClick={onClose} className={btn} aria-label="Close">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 touch-none overflow-hidden"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onWheel={(e) => setScale((s) => Math.min(5, Math.max(1, s - e.deltaY * 0.002)))}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- EXIF rotation, full resolution */}
        <img
          src={images[index]}
          alt={title}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full select-none object-contain"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transition: dragging ? "none" : "transform 0.2s ease-out" }}
        />
        {count > 1 && (
          <>
            <button type="button" onClick={() => step(-1)} className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`} aria-label="Previous photo">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" onClick={() => step(1)} className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`} aria-label="Next photo">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] [scrollbar-width:none]">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => {
                reset();
                onIndex(i);
              }}
              aria-label={`Photo ${i + 1}`}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ${i === index ? "ring-red" : "ring-transparent opacity-60"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- EXIF rotation */}
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
