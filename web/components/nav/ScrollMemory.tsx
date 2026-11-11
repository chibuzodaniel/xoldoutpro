"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Back / swipe-back returns to where you were (explicit ask, 2026-11-11).
// The app scrolls inside its own column (#app-scroll, app/layout.tsx), not the
// window, so neither the browser nor Next.js can restore the position. This
// remembers each page's position and, on back/forward, puts it back —
// retrying while the page's content (feeds load after the page opens) grows
// tall enough, and stopping as soon as the user scrolls themself.

const positions = new Map<string, number>();
let restoring = false;
const keyNow = () => window.location.pathname + window.location.search;

export function ScrollMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Remember the position as the user scrolls (once per frame).
  useEffect(() => {
    const el = document.getElementById("app-scroll");
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (restoring || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        positions.set(keyNow(), el.scrollTop);
      });
    };
    const onPop = () => {
      restoring = true;
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
    const el = document.getElementById("app-scroll");
    if (!el || !restoring) return;
    const target = positions.get(keyNow()) ?? 0;
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
