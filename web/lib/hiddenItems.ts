"use client";

import { useSyncExternalStore } from "react";

// "Not interested" on a Discover card (v2, design/v2-prototype): the card is
// hidden in this browser. Kept in localStorage — costs the server nothing.

const STORAGE_KEY = "xoldout.hidden.v1";
const EVENT = "xoldout:hidden-changed";
const EMPTY: string[] = [];
let cache: { raw: string | null; ids: string[] } = { raw: null, ids: EMPTY };

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cache.raw) return cache.ids;
    const ids = raw ? (JSON.parse(raw) as string[]) : EMPTY;
    cache = { raw, ids: Array.isArray(ids) ? ids : EMPTY };
    return cache.ids;
  } catch {
    return EMPTY;
  }
}

export function hideItem(id: string) {
  const ids = read();
  if (ids.includes(id)) return;
  try {
    // Keep the newest 500 so the list can't grow forever.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, id].slice(-500)));
  } catch {
    // Storage blocked — the card just stays hidden until reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useHiddenItems(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
