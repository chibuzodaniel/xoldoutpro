"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

const OwnedProductsContext = createContext<Set<string>>(new Set());

export function useOwnedProducts() {
  return useContext(OwnedProductsContext);
}

export function OwnedBadgesProvider({ productIds, children }: { productIds: string[]; children: ReactNode }) {
  const [owned, setOwned] = useState<Set<string>>(new Set());
  // Dedupe/stringify so this only re-fires when the actual id set changes,
  // not on every render of a parent that recomputes the array identity.
  const key = Array.from(new Set(productIds)).sort().join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    apiFetch(`/api/me/entitlements?productIds=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : { entitled: [] }))
      .then((data) => {
        if (!cancelled) setOwned(new Set(data.entitled ?? []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  return <OwnedProductsContext.Provider value={owned}>{children}</OwnedProductsContext.Provider>;
}
