import type { ImageLadder } from "./discoverTypes";

export type GiftProduct = {
  id: string;
  title: string;
  type: "RELEASE" | "BEAT" | "EVENT";
  release: { artworkLadder: ImageLadder } | null;
  beat: { coverImageLadder: ImageLadder } | null;
};

export type SentGift = {
  id: string;
  status: "PENDING" | "CLAIMED" | "EXPIRED" | "REFUNDED";
  claimToken: string;
  expiresAt: string;
  product: GiftProduct;
  claimedBy: { handle: string; displayName: string } | null;
};

export type ReceivedGift = {
  id: string;
  claimedAt: string | null;
  product: GiftProduct;
  giver: { handle: string; displayName: string };
};
