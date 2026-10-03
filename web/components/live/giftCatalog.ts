import type { GiftArtType } from "@/components/live/LiveIcons";

// Client-side mirror of lib/live/spend.ts's GIFT_CATALOG (that module imports
// the DB, so it can't be pulled into a client bundle). Keep the two in sync.
// `emoji` is the small inline glyph on chat-feed gift rows, per the mockup;
// the sheet and the big celebration use GiftArt instead.
export const GIFT_TYPES: { type: GiftArtType; label: string; emoji: string; xgAmount: number }[] = [
  { type: "STAR", label: "Star", emoji: "⭐", xgAmount: 10 },
  { type: "MIC", label: "Mic", emoji: "🎙️", xgAmount: 50 },
  { type: "MONEY_SPRAY", label: "Money Spray", emoji: "💵", xgAmount: 200 },
  { type: "GRAMMY", label: "Grammy", emoji: "🏆", xgAmount: 500 },
];

export function giftByType(type: string) {
  return GIFT_TYPES.find((g) => g.type === type);
}

// Consecutive same-sender, same-gift sends within this window stack into one
// "×N" combo (toast, big celebration, and feed row) instead of N separate rows.
export const GIFT_COMBO_WINDOW_MS = 4000;
