"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { setBackNav } from "@/lib/backNav";

// Back / swipe-back returns to where you were (explicit ask, 2026-11-11 and
// 2026-11-13). The app scrolls inside its own column (#app-scroll,
// app/layout.tsx), not the window, so neither the browser nor Next.js can
// restore the position. This remembers each page's position and, on
// back/forward to a different page, puts it back — while the page's repeat
// requests are answered from a short-lived copy (lib/api.ts), so it comes back
// with the same content instead of reloading. Retries while content grows and
// stops as soon as the user scrolls themself. A back that only closes a sheet
// (same address — lib/backNav.ts useBackToClose) is ignored.

const positions = new Map<string, number>();
let restoring = false;
let currentKey = "";
let backNavTimer: ReturnType<typeof setTimeout> | undefined;
const keyNow = () => window.location.pathname + window.location.search;

export function ScrollMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Remember the position as the user scrolls (once per frame).
  useEffect(() => {
    const el = document.getElementById("app-scroll");
    if (!el) return;
    currentKey = keyNow();
    let frame = 0;
    const onScroll = () => {
      if (restoring || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        positions.set(keyNow(), el.scrollTop);
      });
    };
    const onPop = () => {
      // Only a back/forward that changes the page restores (not closing a sheet).
      if (keyNow() === currentKey) return;
      restoring = true;
      // Repeat requests are answered from the saved copy for a moment, so the
      // page comes back as it was (lib/api.ts).
      setBackNav(true);
      clearTimeout(backNavTimer);
      backNavTimer = setTimeout(() => setBackNav(false), 2500);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
      cancelAnimationFrame(frame);
    };
  }, []);

  // After a back/forward navigation renders, scroll to the saved spot.
  useEffect(() => {
    currentKey = keyNow();
    const el = document.getElementById("app-scroll");
    if (!el || !restoring) return;
    const target = positions.get(currentKey) ?? 0;
    let done = false;
    const stop = () => {
      done = true;
      restoring = false;
      cleanup();
    };
    const tryRestore = () => {
      if (done) return;
      el.scrollTop = target;
      // Reached it (or the page can't get any taller): finished.
      if (Math.abs(el.scrollTop - target) < 2) stop();
    };
    const userTook = () => stop();
    const observer = new ResizeObserver(tryRestore);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener("wheel", userTook, { passive: true });
    el.addEventListener("touchstart", userTook, { passive: true });
    const timer = setTimeout(stop, 4000);
    function cleanup() {
      observer.disconnect();
      clearTimeout(timer);
      el!.removeEventListener("wheel", userTook);
      el!.removeEventListener("touchstart", userTook);
    }
    requestAnimationFrame(tryRestore);
    return () => {
      if (!done) cleanup();
    };
  }, [pathname, searchParams]);

  return null;
}
