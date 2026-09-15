import type { ImageLadder, StockPolicy } from "./discoverTypes";

export type EventTierDetail = {
  productId: string;
  name: string;
  product: { priceKobo: number; stockPolicy: StockPolicy };
};

export type EventDetail = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  coverImageLadder: ImageLadder;
  venue: string | null;
  isVirtual: boolean;
  startsAt: string;
  creator: { handle: string; displayName: string };
  tiers: EventTierDetail[];
};
