"use client";

import { useEffect } from "react";

// Full-screen view of a photo sent in a direct message (explicit ask,
// 2026-10-15: tapping an image should open it full page) — replaces the old
// open-the-raw-file-in-a-new-tab link. Closes on ✕, a tap outside the
// image, or Escape.
export function ImageViewer({ src, onClose }: { src: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" onClick={onClose} role="dialog" aria-modal="true">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 h-10 w-10 rounded-full bg-white/10 text-xl text-white flex items-center justify-center"
        style={{ top: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded R2 image, same as the bubble */}
      <img src={src} alt="Photo" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
