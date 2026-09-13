import type { ImageLadder } from "./discoverTypes";

export type LibraryTrack = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  durationSec: number;
  lyricsText: string | null;
};

export type LibraryEntitlement = {
  id: string;
  pinnedAt: string | null;
  product: {
    id: string;
    title: string;
    creator: { displayName: string; handle: string };
    release: { artworkLadder: ImageLadder; tracks: LibraryTrack[] } | null;
    beat: { coverImageLadder: ImageLadder; durationSec: number } | null;
    merchItem: { imageLadder: ImageLadder } | null;
    ticketTier: {
      name: string;
      event: { title: string; venue: string | null; isVirtual: boolean; startsAt: string; coverImageLadder: ImageLadder };
    } | null;
  };
  order: {
    merchFulfillment: { status: "TO_SHIP" | "SHIPPED" | "DELIVERED"; trackingInfo: string | null } | null;
  };
  checkIn: { code: string; checkedInAt: string | null } | null;
};
