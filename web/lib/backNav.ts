"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Back / swipe-back returns you to exactly where you were (explicit ask,
// 2026-11-13). Three pieces share this file:
// 1. A "back navigation in progress" flag (set by components/nav/ScrollMemory
//    when back/forward changes the page) — while it's on, lib/api.ts answers
//    repeat GET requests from a short-lived copy, so the page comes back with
//    the same content instantly instead of reloading.
// 2. setUrlParam: tabs write themselves into the address (?tab=…) without a
//    new history entry, so going back lands on the same tab.
// 3. useBackToClose: an open sheet/overlay adds a history step, so back
//    closes it instead of leaving the page.

let backNav = false;
export const isBackNav = () => backNav;
export const setBackNav = (v: boolean) => {
  backNav = v;
};

/** Marks history entries that only exist to close an overlay. */
export const OVERLAY_KEY = "__xoOverlay";

export function setUrlParam(name: string, value: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value == null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
}

let overlaySeq = 0;

/**
 * While `open`, back/swipe-back calls onClose instead of leaving the page.
 * Closing it any other way removes the extra history step again — unless the
 * close was caused by navigating somewhere (a link inside it), which is left alone.
 */
export function useBackToClose(open: boolean, onClose: () => void, container?: { current: HTMLElement | null }) {
  const router = useRouter();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const id = ++overlaySeq;
    const href = window.location.href;
    window.history.pushState({ ...(window.history.state ?? {}), [OVERLAY_KEY]: id }, "", href);
    let poppedByBack = false;
    const onPop = () => {
      if ((window.history.state as Record<string, unknown> | null)?.[OVERLAY_KEY] !== id) {
        poppedByBack = true;
        closeRef.current();
      }
    };
    // A link inside the overlay: take the overlay's history step off first,
    // then go, so one back press returns to the page you came from.
    let leavingByLink = false;
    const onLinkClick = (e: MouseEvent) => {
      const box = container?.current;
      if (!box || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !box.contains(a) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      if (leavingByLink) return;
      leavingByLink = true;
      const to = url.pathname + url.search + url.hash;
      // One-shot, so it still runs if the overlay closes before the back lands.
      window.addEventListener("popstate", () => router.push(to), { once: true });
      window.history.back();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onLinkClick, true);
      // Closed with a button/swipe: take our extra step back off — but only if
      // we're still on it (a link inside may already have navigated away).
      const stillOurs = (window.history.state as Record<string, unknown> | null)?.[OVERLAY_KEY] === id && window.location.href === href;
      if (!poppedByBack && !leavingByLink && stillOurs) window.history.back();
    };
  }, [open, router, container]);
}

// ─── Page snapshots (2026-11-13) ───────────────────────────────────────────
// Lists that load more as you go ("Show older posts") keep everything you had
// loaded when you leave; coming back with back/forward restores that exact
// list (so the scroll position lands on the same item) instead of page one.
const snapshots = new Map<string, unknown>();

export function saveSnapshot(key: string, value: unknown) {
  snapshots.set(key, value);
  if (snapshots.size > 40) snapshots.delete(snapshots.keys().next().value as string);
}

/** The saved list for `key`, only right after back/forward; otherwise undefined. */
export function takeSnapshot<T>(key: string): T | undefined {
  return isBackNav() ? (snapshots.get(key) as T | undefined) : undefined;
}
