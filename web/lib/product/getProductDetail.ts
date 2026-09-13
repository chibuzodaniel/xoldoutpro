import { db } from "@/lib/db";

// Deliberately excludes audioMasterUrl/audioStreamUrl on both Track and
// Beat — those are only ever safe to hand to an entitled listener, and this
// data reaches an unauthenticated public API. previewAudioUrl (a real
// server-trimmed clip) is the only audio field exposed here.
const trackSelect = {
  id: true,
  order: true,
  title: true,
  description: true,
  previewAudioUrl: true,
  waveformPeaksUrl: true,
  previewStartSec: true,
  previewEndSec: true,
  durationSec: true,
} as const;

export async function getProductDetail(id: string) {
  const product = await db.product.findUnique({
    where: { id },
    include: {
      creator: { select: { handle: true, displayName: true, avatarUrl: true } },
      release: {
        select: {
          releaseType: true,
          artworkLadder: true,
          tracks: { orderBy: { order: "asc" }, select: trackSelect },
        },
      },
      beat: {
        select: {
          coverImageLadder: true,
          previewAudioUrl: true,
          waveformPeaksUrl: true,
          previewStartSec: true,
          previewEndSec: true,
          durationSec: true,
          bpm: true,
          musicalKey: true,
          tags: true,
        },
      },
      merchItem: { select: { imageLadder: true, galleryImageUrls: true, shippingFeeKobo: true } },
      stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
    },
  });

  if (!product || product.status !== "PUBLISHED") return null;
  return product;
}
