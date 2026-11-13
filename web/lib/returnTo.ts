"use client";

// Back to where you were after signing in or up (explicit ask, 2026-11-13).
// The page someone was on (or the members-only link they opened) rides
// through /login → /signup → /onboarding as ?next=, and the last page they
// viewed is remembered in this tab too, for "Sign in" links that don't carry
// it. Only XOLDOUT paths are ever followed (never another site).

const KEY = "xo:returnTo";
const AUTH_PAGES = /^\/(login|signup|onboarding|reset-password|recoveraccount)(\/|\?|#|$)/;

/** An in-app path that's safe to send someone back to, or null. */
export function safePath(p: string | null | undefined): string | null {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) return null;
  if (AUTH_PAGES.test(p)) return null;
  return p;
}

export function rememberPath(p: string) {
  const s = safePath(p);
  if (!s) return;
  try {
    sessionStorage.setItem(KEY, s);
  } catch {
    // storage blocked — the ?next= param still works
  }
}

/** Where to go after auth: ?next=, else the last page this tab saw, else the fallback. */
export function returnTo(nextParam: string | null | undefined, fallback = "/discover") {
  let stored: string | null = null;
  try {
    stored = safePath(sessionStorage.getItem(KEY));
  } catch {
    stored = null;
  }
  return safePath(nextParam) ?? stored ?? fallback;
}

/** `/login?next=…` (or the bare path when there's nothing to come back to). */
export function withNext(path: string, next: string | null | undefined) {
  const s = safePath(next);
  return s ? `${path}?next=${encodeURIComponent(s)}` : path;
}
