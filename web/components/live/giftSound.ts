// Gift celebration sound (explicit ask, 2026-10-04: "when someone sends a
// gift there should be a sound like celebration of the gift"). A bell chime
// for small gifts, a fanfare for big ones — both synthesized by
// scripts/generate-gift-sounds.mjs. Played from GiftCelebration, so every
// Live screen (host and viewer) gets it for every gift.

const BIG_GIFTS = new Set(["MONEY_SPRAY", "GRAMMY"]);

// Rapid combos (tapping Star ten times) would otherwise stack ten chimes on
// top of each other; one per window is plenty to feel celebratory.
const MIN_GAP_MS = 180;
let lastPlayedAt = 0;
const cache = new Map<string, HTMLAudioElement>();

export function playGiftSound(giftType: string) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const big = BIG_GIFTS.has(giftType);
  if (!big && now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;

  const src = big ? "/sounds/gift-big.wav" : "/sounds/gift-small.wav";
  let base = cache.get(src);
  if (!base) {
    base = new Audio(src);
    base.preload = "auto";
    cache.set(src, base);
  }
  // A fresh copy per play so overlapping gifts don't cut each other off.
  const audio = base.cloneNode() as HTMLAudioElement;
  audio.volume = big ? 0.75 : 0.6;
  // Rejected when the browser still blocks autoplay (the viewer hasn't
  // tapped anything yet) — the visual celebration carries on regardless.
  audio.play().catch(() => {});
}
