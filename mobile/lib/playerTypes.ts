export type PlayableTrack = {
  trackId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  productId: string;
  // "track" (default) fetches /api/tracks/:id/audio-url; "beat" fetches
  // /api/beats/:id/audio-url — see usePreviewPlayer's comment on why these
  // are two different endpoints.
  kind?: "track" | "beat";
};
