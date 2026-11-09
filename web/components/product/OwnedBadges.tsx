"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

const OwnedProductsContext = createContext<Set<string>>(new Set());

// Likes (v2 feed cards): which of the page's products the viewer liked, plus
// a toggle. Loaded by the same request as owned badges.
type LikedState = { liked: Set<string>; setLiked: (productId: string, liked: boolean) => void };
const LikedProductsContext = createContext<LikedState>({ liked: new Set(), setLiked: () => {} });

export function useOwnedProducts() {
  return useContext(OwnedProductsContext);
}

export function useLikedProducts() {
  return useContext(LikedProductsContext);
}

export function OwnedBadgesProvider({ productIds, children }: { productIds: string[]; children: ReactNode }) {
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [liked, setLikedSet] = useState<Set<string>>(new Set());
  // Dedupe/stringify so this only re-fires when the actual id set changes,
  // not on every render of a parent that recomputes the array identity.
  const key = Array.from(new Set(productIds)).sort().join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    apiFetch(`/api/me/entitlements?productIds=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : { entitled: [] }))
      .then((data) => {
        if (cancelled) return;
        setOwned(new Set(data.entitled ?? []));
        setLikedSet(new Set(data.liked ?? []));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setLiked = (productId: string, value: boolean) =>
    setLikedSet((cur) => {
      const next = new Set(cur);
      if (value) next.add(productId);
      else next.delete(productId);
      return next;
    });

  return (
    <OwnedProductsContext.Provider value={owned}>
      <LikedProductsContext.Provider value={{ liked, setLiked }}>{children}</LikedProductsContext.Provider>
    </OwnedProductsContext.Provider>
  );
}
