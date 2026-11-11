"use client";

import { useEffect, useRef } from "react";

// Profile card details on ONE line (explicit ask, 2026-11-11: the card was
// too tall): location first, then tags, then anything extra (owner's edit
// button, Get Verified). When it's wider than the card it slides along by
// itself every few seconds (explicit ask) and returns to the start; it holds
// still while touched, when the tab is hidden, or with reduced motion.
const STEP_MS = 3000;

export function ProfileMetaLine({ location, tags, children }: { location?: string | null; tags: string[]; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let held = false;
    let atEndTicks = 0;
    const hold = () => (held = true);
    const release = () => (held = false);
    el.addEventListener("pointerdown", hold);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("mouseenter", hold);
    el.addEventListener("mouseleave", release);
    const id = setInterval(() => {
      const overflow = el.scrollWidth - el.clientWidth;
      if (overflow <= 2 || held || document.visibilityState !== "visible") return;
      if (el.scrollLeft >= overflow - 2) {
        // Pause one step at the end, then go back to the start.
        if (++atEndTicks >= 2) {
          atEndTicks = 0;
          el.scrollTo({ left: 0, behavior: "smooth" });
        }
        return;
      }
      el.scrollTo({ left: Math.min(overflow, el.scrollLeft + Math.max(80, el.clientWidth * 0.6)), behavior: "smooth" });
    }, STEP_MS);
    return () => {
      clearInterval(id);
      el.removeEventListener("pointerdown", hold);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
      el.removeEventListener("mouseenter", hold);
      el.removeEventListener("mouseleave", release);
    };
  }, [location, tags.length]);

  if (!location && tags.length === 0 && !children) return null;
  return (
    <div ref={ref} className="mt-1.5 flex flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
      {location && (
        <span className="flex max-w-[60%] shrink-0 items-center gap-1 text-[12px] text-white/75">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" strokeLinejoin="round" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <span className="truncate">{location}</span>
        </span>
      )}
      {location && tags.length > 0 && <span className="shrink-0 text-white/40">·</span>}
      {tags.map((tag) => (
        <span key={tag} className="shrink-0 rounded-full border border-white/25 px-2 py-px text-[11px] text-white/80">
          {tag}
        </span>
      ))}
      {children}
    </div>
  );
}
