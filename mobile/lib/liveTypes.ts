export type LiveSessionSummary = {
  id: string;
  title: string;
  isPaidAccess: boolean;
  priceXg: number;
  // Optional: older API deploys don't send it yet (see web's lib/live/sessions.ts listLiveSessionsNow).
  viewerCount?: number;
  startedAt: string;
  creator: { handle: string; displayName: string; avatarUrl: string | null };
};

// GET /api/live's `upcoming` — scheduled Lives, soonest first.
export type UpcomingLiveSummary = {
  id: string;
  title: string;
  scheduledFor: string | null;
  isPaidAccess: boolean;
  priceXg: number;
  reminderCount: number;
  creator: { handle: string; displayName: string; avatarUrl: string | null };
};

export type PinnedLiveProduct = { id: string; type: "RELEASE" | "BEAT" | "MERCH"; title: string; priceKobo: number };

export type LiveJoinResponse = {
  token: string;
  url: string;
  isHost: boolean;
  viewerId?: string;
  // The host's LiveKit identity — keeps the host's video full-screen while
  // anyone else on stage shows as a tile (components/live/Stage.tsx).
  hostId?: string;
  roomName: string;
  session?: { title: string; creator: { displayName: string; avatarUrl: string | null }; pinnedProduct: PinnedLiveProduct | null };
};

export type XgPack = { xgAmount: number; priceKobo: number; bonusPercent?: number };

export type GiftType = "STAR" | "MIC" | "MONEY_SPRAY" | "GRAMMY";

// Mirrors web's components/live/giftCatalog.ts (and lib/live/spend.ts's
// server-side GIFT_CATALOG). `emoji` is the small glyph at the end of a
// chat-feed gift row; the sheet and the big celebration use GiftArt.
export const GIFT_CATALOG: { type: GiftType; label: string; emoji: string; xgAmount: number }[] = [
  { type: "STAR", label: "Star", emoji: "⭐", xgAmount: 10 },
  { type: "MIC", label: "Mic", emoji: "🎙️", xgAmount: 50 },
  { type: "MONEY_SPRAY", label: "Money Spray", emoji: "💵", xgAmount: 200 },
  { type: "GRAMMY", label: "Grammy", emoji: "🏆", xgAmount: 500 },
];

export function giftByType(type: string) {
  return GIFT_CATALOG.find((g) => g.type === type);
}

// Consecutive same-sender, same-gift sends within this window stack into one
// "×N" combo instead of N separate rows — same as web.
export const GIFT_COMBO_WINDOW_MS = 4000;

export type LiveFeedItem =
  | {
      kind: "chat";
      id: string;
      senderName: string;
      text: string;
      // Host-only @-mentions (components/live/mentions.tsx).
      mentions?: { userId: string; handle: string; displayName: string }[];
      fromHost?: boolean;
      mentionsMe?: boolean;
    }
  | { kind: "system"; id: string; text: string }
  | { kind: "gift"; id: string; senderId: string; senderName: string; giftType: GiftType; label: string; count: number; at: number }
  | { kind: "request"; id: string; senderName: string; message: string; xgAmount: number };

export type GiftEvent = { giftId: string; giftType: GiftType; label: string; senderId: string; senderName: string; xgAmount?: number };

/** The latest gift (top banner + big celebration) — `key` changes on every send so the animation replays, even mid-combo. */
export type GiftMoment = { key: string; giftType: GiftType; label: string; senderName: string; senderId: string; count: number };

/** Same combo-stacking rule as web's components/live/LiveFeed.tsx appendGift. */
export function appendGift(feed: LiveFeedItem[], event: GiftEvent, now = Date.now()): { feed: LiveFeedItem[]; count: number } {
  const last = feed[feed.length - 1];
  if (
    last?.kind === "gift" &&
    last.senderId === event.senderId &&
    last.giftType === event.giftType &&
    now - last.at < GIFT_COMBO_WINDOW_MS
  ) {
    const count = last.count + 1;
    return { feed: [...feed.slice(0, -1), { ...last, count, at: now }], count };
  }
  return {
    feed: [
      ...feed,
      {
        kind: "gift",
        id: event.giftId,
        senderId: event.senderId,
        senderName: event.senderName,
        giftType: event.giftType,
        label: event.label,
        count: 1,
        at: now,
      },
    ],
    count: 1,
  };
}

export type PendingLiveRequest = { id: string; senderName: string; message: string; xgAmount: number };
