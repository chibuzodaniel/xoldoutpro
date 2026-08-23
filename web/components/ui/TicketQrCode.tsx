"use client";

import { useState } from "react";

// A small inline QR thumbnail (as already shown in Library, the checkout
// success screen, and an owned event ticket) is too small to reliably scan
// off a phone screen at a door — this wraps the existing thumbnail so
// tapping it opens the same QR at full-screen size instead. Relies on
// every call site generating the underlying data URL at a large native
// resolution (512px) so the full-screen view is a downscale-then-upscale
// within that same bitmap, never a blurry upscale past its source size.
export function TicketQrCode({
  qrDataUrl,
  label,
  thumbnailClassName,
}: {
  qrDataUrl: string;
  label?: string;
  thumbnailClassName: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setExpanded(true)} aria-label="Show larger QR code" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="Ticket QR code" className={thumbnailClassName} />
      </button>

      {expanded && (
        <div
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-6 bg-black/90 px-6"
          onClick={() => setExpanded(false)}
          role="presentation"
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="Close"
            className="absolute top-5 right-5 h-9 w-9 rounded-full border border-white/30 flex items-center justify-center text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="Ticket QR code"
            className="w-full max-w-[min(85vw,420px)] aspect-square rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          />
          {label && <p className="text-sm font-semibold text-white text-center px-4">{label}</p>}
          <p className="text-xs text-white/60">Tap anywhere to close</p>
        </div>
      )}
    </>
  );
}
