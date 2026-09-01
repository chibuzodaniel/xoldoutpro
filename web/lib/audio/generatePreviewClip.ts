import { randomUUID } from "crypto";
import { getObjectBuffer, putObjectBuffer } from "@/lib/storage/r2";
import { trimToPreviewMp3 } from "./transcode";

/**
 * Produces a real, physically separate short clip covering only
 * [startSec, endSec) of the given full-length streaming rendition, and
 * uploads it as its own R2 object. This is what makes "preview" mean
 * something: app/api/tracks/[id]/audio-url and app/api/beats/[id]/audio-url
 * only ever hand a non-entitled request this key, never the full track —
 * previously the same full-length `audioStreamUrl` was signed for everyone,
 * with the preview window enforced only by the in-app player choosing when
 * to stop, so anyone calling the API directly could download the entire
 * unpurchased song or beat.
 */
export async function generatePreviewClip(
  userId: string,
  streamKey: string,
  startSec: number,
  endSec: number,
): Promise<string> {
  const stream = await getObjectBuffer(streamKey);
  const clip = await trimToPreviewMp3(stream, startSec, endSec);
  const previewKey = `audio/${userId}/${randomUUID()}-preview.mp3`;
  await putObjectBuffer(previewKey, clip, "audio/mpeg");
  return previewKey;
}
