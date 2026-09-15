import { apiPost } from "./api";

const EXT_BY_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

export type AudioIngestResult = {
  durationSec: number;
  peaks: number[];
  audioMasterKey: string;
  audioStreamKey: string;
  waveformPeaksKey: string;
  previewDefaults: { start: number; end: number };
};

// Mirrors web's lib/uploadAudio.ts: presigns a direct-to-R2 upload, PUTs the
// master file, then runs the server-side ingest pipeline (probe, waveform,
// transcode) and returns everything the publish wizard needs.
export async function uploadAndIngestAudio(uri: string, mimeType: string, idToken: string): Promise<AudioIngestResult> {
  const extension = EXT_BY_TYPE[mimeType];
  if (!extension) throw new Error(`Unsupported audio type: ${mimeType}. Use MP3 or WAV.`);

  const { key, uploadUrl } = await apiPost<{ key: string; uploadUrl: string }>("/api/uploads/presign", idToken, {
    kind: "audio",
    contentType: mimeType,
    extension,
  });

  const blob = await (await fetch(uri)).blob();
  const putRes = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": mimeType } });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  return apiPost<AudioIngestResult>("/api/uploads/audio/ingest", idToken, { key, mimeType });
}
