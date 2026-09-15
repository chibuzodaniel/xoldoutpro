import type { LibraryEntitlement } from "./libraryTypes";
import type { PlayableTrack } from "./playerTypes";

export const FULFILLMENT_LABEL: Record<"TO_SHIP" | "SHIPPED" | "DELIVERED", string> = {
  TO_SHIP: "Preparing to ship",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export function artworkUrl(release: LibraryEntitlement["product"]["release"]) {
  return release?.artworkLadder?.["1024"] ?? null;
}

export function beatCoverUrl(beat: LibraryEntitlement["product"]["beat"]) {
  return beat?.coverImageLadder?.["1024"] ?? null;
}

export function merchImageUrl(merchItem: LibraryEntitlement["product"]["merchItem"]) {
  return merchItem?.imageLadder?.["64"] ?? null;
}

export function buildPlayable(e: LibraryEntitlement): PlayableTrack[] {
  if (e.product.release) {
    return e.product.release.tracks.map((t) => ({
      trackId: t.id,
      title: t.title,
      artistName: e.product.creator.displayName,
      artworkUrl: artworkUrl(e.product.release),
      productId: e.product.id,
      lyricsText: t.lyricsText,
      kind: "track",
    }));
  }
  if (e.product.beat) {
    return [
      {
        trackId: e.product.id,
        title: e.product.title,
        artistName: e.product.creator.displayName,
        artworkUrl: beatCoverUrl(e.product.beat),
        productId: e.product.id,
        lyricsText: null,
        kind: "beat",
      },
    ];
  }
  return [];
}

export function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
