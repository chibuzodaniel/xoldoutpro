"use client";

import { useSyncExternalStore } from "react";

// The cart (v2, design/v2-prototype, 2026-11-09) lives in this browser's
// localStorage — adding/removing costs the server nothing. It's checked out
// in one payment by POST /api/checkout/cart, which re-checks every price,
// stock level and rule server-side; what's stored here is only for display.

export type CartItem = {
  key: string; // productId (+ variant/license) — one line per distinct pick
  productId: string;
  type: "RELEASE" | "BEAT" | "MERCH";
  title: string;
  artistName: string;
  imageUrl: string | null;
  href: string;
  unitPriceKobo: number;
  quantity: number;
  variantId?: string;
  variantLabel?: string;
  licenseId?: string;
  licenseName?: string;
  acceptedLicenseTerms?: boolean;
  payAmountKobo?: number;
};

const STORAGE_KEY = "xoldout.cart.v1";
const EVENT = "xoldout:cart-changed";
const EMPTY: CartItem[] = [];
let cache: { raw: string | null; items: CartItem[] } = { raw: null, items: EMPTY };

function read(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cache.raw) return cache.items;
    const items = raw ? (JSON.parse(raw) as CartItem[]) : EMPTY;
    cache = { raw, items: Array.isArray(items) ? items : EMPTY };
    return cache.items;
  } catch {
    return EMPTY;
  }
}

function write(items: CartItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage blocked (private mode) — the cart just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function cartKey(i: Pick<CartItem, "productId" | "variantId" | "licenseId">) {
  return [i.productId, i.variantId ?? "", i.licenseId ?? ""].join(":");
}

/** Adds an item (merch quantities add up; songs/beats replace their earlier line). Returns false if already there. */
export function addToCart(item: Omit<CartItem, "key">): boolean {
  const items = read();
  const key = cartKey(item);
  if (item.type !== "MERCH") {
    const existing = items.find((i) => i.productId === item.productId);
    if (existing && existing.key === key && existing.payAmountKobo === item.payAmountKobo) return false;
    write([...items.filter((i) => i.productId !== item.productId), { ...item, key }]);
    return true;
  }
  const existing = items.find((i) => i.key === key);
  if (existing) {
    write(items.map((i) => (i.key === key ? { ...i, quantity: Math.min(20, i.quantity + item.quantity) } : i)));
  } else {
    write([...items, { ...item, key }]);
  }
  return true;
}

export function removeFromCart(key: string) {
  write(read().filter((i) => i.key !== key));
}

export function setCartQuantity(key: string, quantity: number) {
  write(read().map((i) => (i.key === key ? { ...i, quantity: Math.max(1, Math.min(20, quantity)) } : i)));
}

export function clearCart() {
  write([]);
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The cart's items; re-renders when it changes (this tab or another). */
export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
