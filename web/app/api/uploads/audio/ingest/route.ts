import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getObjectBuffer, putObjectBuffer } from "@/lib/storage/r2";
import { probeAudio } from "@/lib/audio/probe";
import { generateWaveformPeaks } from "@/lib/audio/waveform";
import { transcodeToStreamingMp3 } from "@/lib/audio/transcode";

export const runtime = "nodejs";
export const maxDuration = 120; // ffmpeg transcode + peak generation on a multi-minute track

const bodySchema = z.object({ key: z.string().min(1), mimeType: z.string().min(1) });

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // PRD should-know default: 200MB per file

/**
 * Runs the full ingest pipeline synchronously against an already-uploaded
 * master (probe duration, generate waveform peaks, transcode a streaming
 * rendition) and returns everything the publish wizard needs. The original
 * master key is left untouched in R2 — it's retained for download
 * entitlements per PRD §7.1.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { key, mimeType } = bodySchema.parse(await req.json());
    if (!key.startsWith(`audio/${user.id}/`)) {
      return NextResponse.json({ error: "Key does not belong to this user" }, { status: 403 });
    }

    const master = await getObjectBuffer(key);
    if (master.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "File exceeds the 200MB upload limit" }, { status: 400 });
    }

    const { durationSec } = await probeAudio(master, mimeType);
    const [peaks, streamMp3] = await Promise.all([
      generateWaveformPeaks(master),
      transcodeToStreamingMp3(master),
    ]);

    const id = randomUUID();
    const audioStreamKey = `audio/${user.id}/${id}-stream.mp3`;
    const waveformPeaksKey = `audio/${user.id}/${id}-peaks.json`;
    await Promise.all([
      putObjectBuffer(audioStreamKey, streamMp3, "audio/mpeg"),
      putObjectBuffer(waveformPeaksKey, Buffer.from(JSON.stringify(peaks)), "application/json"),
    ]);

    const defaultPreviewLength = 30;
    return NextResponse.json({
      durationSec,
      peaks,
      audioMasterKey: key,
      audioStreamKey,
      waveformPeaksKey,
      previewDefaults: {
        start: 0,
        end: Math.min(defaultPreviewLength, durationSec),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not process audio" }, { status: 500 });
  }
}
