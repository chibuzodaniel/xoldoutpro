"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Section = { type: string; label: string; href: string };

// The floating "Music ▾" pill (design/v2-prototype, 2026-11-09): appears once
// the section pills have scrolled out of view, so the section can be changed
// without scrolling back up. Watches a marker after the pills with an
// IntersectionObserver — no scroll listeners or timers.
export function SectionSwitcher({ current, sections, markerId }: { current: string; sections: Section[]; markerId: string }) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const active = sections.find((s) => s.type === current) ?? sections[0];

  useEffect(() => {
    const marker = document.getElementById(markerId);
    if (!marker) return;
    const io = new IntersectionObserver(([entry]) => {
      // Only once it has gone off the top (not when it's still below the fold).
      const past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      setVisible(past);
      if (!past) setOpen(false);
    });
    io.observe(marker);
    return () => io.disconnect();
  }, [markerId]);

  if (!visible) return null;
  return (
    <div className="fixed left-4 top-[72px] z-30 md:left-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-line bg-surface/95 px-4 py-2.5 text-[15px] font-semibold shadow-lg backdrop-blur"
      >
        {active.label}
        <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="mt-2 w-44 overflow-hidden rounded-2xl border border-line bg-surface shadow-xl">
          {sections.map((s) => (
            <Link
              key={s.type}
              href={s.href}
              onClick={() => setOpen(false)}
              className={`block px-4 py-3 text-[15px] ${s.type === current ? "font-bold text-red-soft" : "text-ink hover:bg-surface-2"}`}
            >
              {s.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
