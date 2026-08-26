"use client";

import { useState } from "react";

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3v12" strokeLinecap="round" />
      <path d="M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Same native-share/clipboard-fallback pattern as the group page and
// ExpandedPlayer, generalized for any product detail page — `path` is
// relative (e.g. `/r/${id}`), resolved against location.origin at share time
// since these pages are Server Components and can't read window themselves.
//
// A solid, labeled pill rather than a bare icon: this is a D2F platform, so
// getting a fan to reshare a product is worth more real estate than a report
// button, not the same visual weight as one (product call 2026-08-26).
export function ShareButton({
  title,
  text,
  path,
  label = "Share to Fans",
  className = "bg-red text-white",
}: {
  title: string;
  text: string;
  path: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}${path}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text, url });
      } catch {
        // user dismissed the native share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — silently give up
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={label}
      className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ${className}`}
    >
      <ShareIcon />
      {copied ? "Copied" : label}
    </button>
  );
}
