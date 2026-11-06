import type { ImageLadder, ProductCreator, StockPolicy } from "./discoverTypes";

export type Track = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  previewAudioUrl: string | null;
  waveformPeaksUrl: string | null;
  previewStartSec: number;
  previewEndSec: number;
  durationSec: number;
};

export type ProductDetail = {
  id: string;
  creatorId: string;
  type: "RELEASE" | "BEAT" | "MERCH";
  title: string;
  description: string | null;
  priceKobo: number;
  // "Let fans pay anything": priceKobo is the ₦500+ minimum, the fan picks the price on the web checkout.
  payWhatYouWant?: boolean;
  // Featured artists, accepted tags only.
  collaborators?: { artist: { id: string; handle: string; displayName: string } }[];
  publishedAt?: string | null;
  creator: ProductCreator & { avatarUrl: string | null };
  release: { releaseType: string; artworkLadder: ImageLadder; genres?: string[]; tracks: Track[] } | null;
  beat: {
    coverImageLadder: ImageLadder;
    previewAudioUrl: string | null;
    waveformPeaksUrl: string | null;
    previewStartSec: number;
    previewEndSec: number;
    durationSec: number;
    bpm: number | null;
    musicalKey: string | null;
    tags: string[];
  } | null;
  merchItem: { imageLadder: ImageLadder; galleryImageUrls: string[]; shippingFeeKobo: number } | null;
  stockPolicy: StockPolicy;
};
