// Ambassador program signup attribution (client-safe, no imports). A
// `?ref=<code>` landing on ANY page (not just /signup — a shared link could
// point anywhere) is captured once into localStorage; first-touch only,
// never overwritten by a later visit. Consumed by AuthProvider's sync call
// on every sign-in, but only ever acted on by the server for a brand-new
// user row (app/api/auth/sync/route.ts) — repeat sends are harmless.
const STORAGE_KEY = "xoldout_ref_code";

export function captureReferralCode(): void {
  try {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code) localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // localStorage unavailable (private mode, blocked storage, etc.) —
    // referral attribution is a nice-to-have, never worth breaking on.
  }
}

export function consumeReferralCode(): string | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    return localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
