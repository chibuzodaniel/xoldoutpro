// Gift celebration sound (explicit ask, 2026-10-04: "when someone sends a
// gift there should be a sound like celebration of the gift"). A bell chime
// for small gifts, a fanfare for big ones — both synthesized by
// scripts/generate-gift-sounds.mjs. Played from GiftCelebration, so every
// Live screen (host and viewer) gets it for every gift.
//
// Web Audio, not <audio> elements: browsers (iPhone Safari above all) only
// let a page make sound after a tap, and Safari applies that per <audio>
// element — so a fresh element per gift, created when a gift *arrives*
// rather than inside a tap, was silently blocked even after the viewer had
// tapped plenty. One AudioContext, resumed on the first tap anywhere
// (unlockGiftSounds), plays every later gift sound without another gesture.

const BIG_GIFTS = new Set(["MONEY_SPRAY", "GRAMMY"]);
const SOURCES = { small: "/sounds/gift-small.wav", big: "/sounds/gift-big.wav" } as const;
type Kind = keyof typeof SOURCES;

// Rapid combos (tapping Star ten times) would otherwise stack ten chimes on
// top of each other; one per window is plenty to feel celebratory.
const MIN_GAP_MS = 180;
let lastPlayedAt = 0;

let ctx: AudioContext | null = null;
const buffers: Partial<Record<Kind, Promise<AudioBuffer | null>>> = {};

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function load(kind: Kind): Promise<AudioBuffer | null> {
  const c = context();
  if (!c) return Promise.resolve(null);
  buffers[kind] ??= fetch(SOURCES[kind])
    .then((res) => res.arrayBuffer())
    .then((data) => c.decodeAudioData(data))
    .catch(() => null);
  return buffers[kind]!;
}

/**
 * Call once a Live page is open: resumes the AudioContext on the first tap
 * or key press anywhere (the gesture browsers require) and preloads both
 * sounds. Returns a cleanup for the listeners.
 */
export function unlockGiftSounds(): () => void {
  const c = context();
  if (!c) return () => {};
  void load("small");
  void load("big");
  const unlock = () => {
    if (c.state === "suspended") void c.resume();
    // iOS also wants something actually played inside the gesture.
    const silent = c.createBuffer(1, 1, 22050);
    const node = c.createBufferSource();
    node.buffer = silent;
    node.connect(c.destination);
    node.start(0);
  };
  const events = ["pointerdown", "touchend", "keydown"] as const;
  events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));
  return () => events.forEach((e) => window.removeEventListener(e, unlock));
}

export function playGiftSound(giftType: string) {
  const c = context();
  if (!c) return;
  const now = Date.now();
  const kind: Kind = BIG_GIFTS.has(giftType) ? "big" : "small";
  if (kind === "small" && now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;

  void load(kind).then((buffer) => {
    // Still locked (no tap yet on this page) — the visual celebration carries on.
    if (!buffer || c.state !== "running") return;
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = kind === "big" ? 0.8 : 0.65;
    source.connect(gain).connect(c.destination);
    source.start();
  });
}
