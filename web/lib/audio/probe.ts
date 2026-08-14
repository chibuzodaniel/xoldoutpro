import { parseBuffer } from "music-metadata";

export async function probeAudio(input: Buffer, mimeType: string) {
  const meta = await parseBuffer(input, mimeType);
  const durationSec = meta.format.duration;
  if (!durationSec) throw new Error("Could not read audio duration");
  return { durationSec, sampleRate: meta.format.sampleRate ?? null, codec: meta.format.codec ?? null };
}
