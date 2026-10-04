import { createAudioPlayer, type AudioPlayer } from "expo-audio";

// Gift celebration sound — mirrors web's components/live/giftSound.ts
// (explicit ask, 2026-10-04: "when someone sends a gift there should be a
// sound like celebration of the gift"). Files are synthesized by
// web/scripts/generate-gift-sounds.mjs. Played from GiftCelebration, so the
// host and viewer screens both get it for every gift.

const BIG_GIFTS = new Set(["MONEY_SPRAY", "GRAMMY"]);
const MIN_GAP_MS = 180;

const SOURCES = {
  small: require("../assets/sounds/gift-small.wav"),
  big: require("../assets/sounds/gift-big.wav"),
};

let lastPlayedAt = 0;
const players: Partial<Record<keyof typeof SOURCES, AudioPlayer>> = {};

function playerFor(kind: keyof typeof SOURCES): AudioPlayer {
  let player = players[kind];
  if (!player) {
    player = createAudioPlayer(SOURCES[kind]);
    player.volume = kind === "big" ? 0.75 : 0.6;
    players[kind] = player;
  }
  return player;
}

export function playGiftSound(giftType: string) {
  const now = Date.now();
  const kind = BIG_GIFTS.has(giftType) ? "big" : "small";
  // Rapid combos would otherwise restart the chime on every tap.
  if (kind === "small" && now - lastPlayedAt < MIN_GAP_MS) return;
  lastPlayedAt = now;
  try {
    const player = playerFor(kind);
    player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => player.play());
  } catch {
    // No audio available (e.g. an unsupported build) — the visual celebration carries on.
  }
}
