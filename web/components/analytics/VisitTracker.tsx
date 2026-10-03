"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Fires one page-view beacon per client-side navigation (moderator
// dashboard's "Site visits" — see lib/analytics/visits.ts). sendBeacon so it
// never delays navigation; the moderation dashboard itself isn't counted.
export function VisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/moderation")) return;
    try {
      if (navigator.sendBeacon?.("/api/analytics/visit")) return;
    } catch {
      // fall through to fetch
    }
    fetch("/api/analytics/visit", { method: "POST", keepalive: true }).catch(() => {});
  }, [pathname]);

  return null;
}
