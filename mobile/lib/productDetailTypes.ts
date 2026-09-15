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
  creator: ProductCreator & { avatarUrl: string | null };
  release: { releaseType: string; artworkLadder: ImageLadder; tracks: Track[] } | null;
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
