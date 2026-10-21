import { presignDownload } from "@/lib/storage/r2";

/**
 * The player's waveform scrubber (vinyl player redesign, 2026-10-21): a
 * short-lived link to the track's peaks JSON (800 loudness values, made at
 * ingest — lib/audio/waveform.ts), returned alongside the audio link so it
 * costs no extra request. A non-buyer only hears the preview, so they also
 * get which slice of the waveform that preview covers (fractions of the
 * full track) and the player draws just that slice.
 */
export async function waveformFor(
  peaksKey: string | null,
  entitled: boolean,
  previewStartSec: number,
  previewEndSec: number,
  durationSec: number,
): Promise<{ peaksUrl?: string; peaksStartFrac?: number; peaksEndFrac?: number }> {
  if (!peaksKey) return {};
  try {
    const peaksUrl = await presignDownload(peaksKey, 300);
    if (entitled || !(durationSec > 0)) return { peaksUrl };
    return {
      peaksUrl,
      peaksStartFrac: Math.max(0, Math.min(1, previewStartSec / durationSec)),
      peaksEndFrac: Math.max(0, Math.min(1, previewEndSec / durationSec)),
    };
  } catch {
    return {};
  }
}
