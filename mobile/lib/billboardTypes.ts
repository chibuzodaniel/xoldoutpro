// Mirrors web's lib/commerce/billboards.ts BillboardSlideData (GET /api/billboards/active).
export type BillboardTarget =
  | { kind: "RELEASE" | "BEAT" | "MERCH" | "EVENT"; id: string; title: string }
  | { kind: "PROFILE"; handle: string }
  | null;

export type BillboardSlide = {
  id: string;
  artworkUrl: string;
  // Optional: older API deploys don't send these yet.
  viewCount?: number;
  target?: BillboardTarget;
  creator: { handle: string; displayName: string } | null;
};
