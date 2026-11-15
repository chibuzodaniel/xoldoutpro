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
// Where you were the moment you tapped something (2026-11-13). Opening a page
// makes Next.js scroll the column to the top *before* the address changes, so
// that jump used to be saved as this page's position — and back went to the
// top. A tap that leads to a new page keeps this spot instead.
let press: { key: string; top: number; at: number } | null = null;
const PRESS_WINDOW_MS = 2000;
const keyNow = () => window.location.pathname + window.location.search;

// Put the saved spot back for the current address and hold it for a few
// seconds (2026-11-14): if the page is swapped or shrinks and regrows (fresh
// data, a loading flash), put it back again — until the user scrolls or
// touches it themself. Called from both the back event and the page change,
// whichever comes first (2026-11-15): Next.js renders the previous page
// *inside* its own popstate handler, so the page change can arrive before our
// popstate listener runs — the old code then skipped the restore entirely and
// left `restoring` stuck on, which also stopped positions being saved.
let stopRestore: (() => void) | null = null;
// The last page change: lets a late popstate tell a page change from a sheet closing.
let lastSwitch = { to: "", at: 0 };
let restoringKey = "";
function startRestore(el: HTMLElement) {
  const key = keyNow();
  if (stopRestore && restoringKey === key) return;
  stopRestore?.();
  restoring = true;
  restoringKey = key;
  const target = positions.get(key) ?? 0;
  let done = false;
  const tryRestore = () => {
    if (done || keyNow() !== key) return;
    if (Math.abs(el.scrollTop - target) >= 2) el.scrollTop = target;
  };
  const observer = new ResizeObserver(tryRestore);
  observer.observe(el);
  if (el.firstElementChild) observer.observe(el.firstElementChild);
  const mo = new MutationObserver(tryRestore);
  mo.observe(el, { childList: true, subtree: true });
  const stop = () => {
    if (done) return;
    done = true;
    restoring = false;
    stopRestore = null;
    observer.disconnect();
    mo.disconnect();
    clearTimeout(timer);
    window.removeEventListener("keydown", stop);
    el.removeEventListener("wheel", stop);
    el.removeEventListener("touchstart", stop);
    // The settled spot is this page's position from here on.
    if (keyNow() === key) positions.set(key, el.scrollTop);
  };
  el.addEventListener("wheel", stop, { passive: true });
  el.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  const timer = setTimeout(stop, 5000);
  stopRestore = stop;
  tryRestore();
  requestAnimationFrame(tryRestore);
}

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
        const key = keyNow();
        // Right after a tap, a jump on the same page is the navigation's scroll-to-top: ignore it.
        if (press && press.key === key && Date.now() - press.at < PRESS_WINDOW_MS && Math.abs(el.scrollTop - press.top) > 4) return;
        positions.set(key, el.scrollTop);
      });
    };
    const onPress = () => {
      press = { key: keyNow(), top: el.scrollTop, at: Date.now() };
    };
    // A finger scroll isn't a tap: forget the press once real scrolling starts.
    const onMove = () => {
      if (press && Date.now() - press.at > 150) press = null;
    };
    const onPop = () => {
      // Only a back/forward that changes the page restores (not closing a sheet).
      // The page may already have switched before this runs (see startRestore).
      const key = keyNow();
      const justSwitched = lastSwitch.to === key && Date.now() - lastSwitch.at < 1000;
      if (key === currentKey && !justSwitched) return;
      startRestore(el);
      // Repeat requests are answered from the saved copy for a moment, so the
      // page comes back as it was (lib/api.ts).
      setBackNav(true);
      clearTimeout(backNavTimer);
      backNavTimer = setTimeout(() => setBackNav(false), 2500);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("popstate", onPop);
    document.addEventListener("pointerdown", onPress, true);
    document.addEventListener("keydown", onPress, true);
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("wheel", onMove, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("pointerdown", onPress, true);
      document.removeEventListener("keydown", onPress, true);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("wheel", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  // After a back/forward navigation renders, scroll to the saved spot.
  useEffect(() => {
    const leaving = currentKey;
    currentKey = keyNow();
    if (leaving !== currentKey) lastSwitch = { to: currentKey, at: Date.now() };
    if (press && press.key === leaving && leaving !== currentKey && Date.now() - press.at < PRESS_WINDOW_MS) {
      positions.set(leaving, press.top);
      press = null;
    }
    const el = document.getElementById("app-scroll");
    if (!el) return;
    // A back/forward whose popstate already ran: restore now the page is here.
    if (restoring && restoringKey !== currentKey) startRestore(el);
  }, [pathname, searchParams]);

  return null;
}
