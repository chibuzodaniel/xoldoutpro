import { apiFetch } from "@/lib/api";

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

/** Uploads a track master to R2, then runs the server-side ingest pipeline (probe, waveform, transcode). */
export async function uploadAndIngestAudio(file: File): Promise<AudioIngestResult> {
  const extension = EXT_BY_TYPE[file.type];
  if (!extension) throw new Error(`Unsupported audio type: ${file.type}. Use MP3 or WAV.`);

  const presignRes = await apiFetch("/api/uploads/presign", {
    method: "POST",
    body: JSON.stringify({ kind: "audio", contentType: file.type, extension }),
  });
  if (!presignRes.ok) throw new Error("Could not get an upload URL");
  const { key, uploadUrl } = await presignRes.json();

  const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  const ingestRes = await apiFetch("/api/uploads/audio/ingest", {
    method: "POST",
    body: JSON.stringify({ key, mimeType: file.type }),
  });
  if (!ingestRes.ok) {
    const data = await ingestRes.json().catch(() => ({}));
    throw new Error(data.error ?? "Could not process audio");
  }
  return ingestRes.json();
}
