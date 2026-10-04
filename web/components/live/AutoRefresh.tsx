"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the current server page every `intervalMs` while the tab is
// visible, and straight away when it becomes visible again — so the Live
// page's "Live now" list picks up Lives that started (or ended) after the
// page was opened, without a manual reload.
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);
  return null;
}
