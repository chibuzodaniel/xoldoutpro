import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generatePreviewClip } from "@/lib/audio/generatePreviewClip";

export const runtime = "nodejs";
export const maxDuration = 300; // one ffmpeg trim per row, could be many rows on first run

/**
 * One-off (but safely re-runnable) fix-up for Track/Beat rows published
 * before previewAudioUrl existed — see app/api/tracks/[id]/audio-url and
 * app/api/beats/[id]/audio-url for why those rows are still handing out the
 * full-length file to non-buyers until this runs. Idempotent: only rows
 * with previewAudioUrl still null are touched, so calling this repeatedly
 * (or after it partially fails) just picks up wherever it left off. Same
 * auth pattern as sweep-holds (either bearer secret works).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const validSecrets = [process.env.CRON_SECRET, process.env.EXTERNAL_CRON_SECRET].filter(Boolean);
  if (!validSecrets.some((secret) => authHeader === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [tracks, beats] = await Promise.all([
    db.track.findMany({
      where: { previewAudioUrl: null, audioStreamUrl: { not: null } },
      include: { release: { include: { product: { select: { creatorId: true } } } } },
    }),
    db.beat.findMany({
      where: { previewAudioUrl: null, audioStreamUrl: { not: null } },
      include: { product: { select: { creatorId: true } } },
    }),
  ]);

  let tracksDone = 0;
  let tracksFailed = 0;
  for (const track of tracks) {
    try {
      const previewAudioUrl = await generatePreviewClip(
        track.release.product.creatorId,
        track.audioStreamUrl!,
        track.previewStartSec,
        track.previewEndSec,
      );
      await db.track.update({ where: { id: track.id }, data: { previewAudioUrl } });
      tracksDone += 1;
    } catch (err) {
      console.error(`backfill-preview-clips: track ${track.id} failed`, err);
      tracksFailed += 1;
    }
  }

  let beatsDone = 0;
  let beatsFailed = 0;
  for (const beat of beats) {
    try {
      const previewAudioUrl = await generatePreviewClip(
        beat.product.creatorId,
        beat.audioStreamUrl!,
        beat.previewStartSec,
        beat.previewEndSec,
      );
      await db.beat.update({ where: { productId: beat.productId }, data: { previewAudioUrl } });
      beatsDone += 1;
    } catch (err) {
      console.error(`backfill-preview-clips: beat ${beat.productId} failed`, err);
      beatsFailed += 1;
    }
  }

  return NextResponse.json({ tracksDone, tracksFailed, beatsDone, beatsFailed });
}
