"use client";

import { useRouter } from "next/navigation";

// v2 product pages (design/v2-prototype): the round back button over the top
// of the page. Goes back in history; a page opened directly (shared link, new
// tab) has nowhere to go back to, so it falls back to Discover.
export function BackCircle({ fallbackHref = "/discover" }: { fallbackHref?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallbackHref))}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-line bg-bg/80 text-ink backdrop-blur"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M19 12H5M11 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
