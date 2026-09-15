import type { EventData, ProductCardData } from "./discoverTypes";

export type CreatorProfile = {
  user: {
    id: string;
    handle: string;
    displayName: string;
    bio: string | null;
    avatarUrl: string | null;
    coverUrl: string | null;
    tags: string[];
    socialLinks: { platform: string; url: string }[];
    isVerified: boolean;
  };
  fansCount: number;
  totalSold: number;
  catalog: ProductCardData[];
  events: EventData[];
};

export type ReleaseType = "SINGLE" | "EP" | "ALBUM";

export type TrackDraft = {
  localId: string;
  title: string;
  description: string;
  lyricsText: string;
  status: "idle" | "uploading" | "ready" | "error";
  error?: string;
  durationSec?: number;
  peaks?: number[];
  audioMasterKey?: string;
  audioStreamKey?: string;
  waveformPeaksKey?: string;
  previewLength: 30 | 50 | "custom";
  previewLengthCustomSec: number;
  previewStartSec: number;
};

export function effectivePreviewLength(t: { durationSec?: number; previewLength: 30 | 50 | "custom"; previewLengthCustomSec: number }) {
  const durationSec = t.durationSec ?? 0;
  const raw = t.previewLength === "custom" ? t.previewLengthCustomSec : t.previewLength;
  return Math.min(Math.max(raw, 5), durationSec || raw);
}
