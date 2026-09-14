import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getObjectBuffer } from "@/lib/storage/r2";
import { embedDownloadMetadata } from "./embedDownloadMetadata";

/**
 * Whether a super-moderator has the real-file-download feature switched on
 * platform-wide. Lazily reads (and implicitly "creates" via the default)
 * the singleton PlatformSettings row — same lazy-default pattern as
 * AmbassadorTierRate, so no seed migration is needed.
 */
export async function downloadsEnabled(): Promise<boolean> {
  const row = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  return row?.downloadsEnabled ?? true;
}

/**
 * Picks the largest available image from a size-ladder JSON column
 * (artworkLadder/coverImageLadder — see lib/images.ts's artworkLadder,
 * whose keys are string-ified pixel sizes like "64"/"256"/"1024"). Prefers
 * "1024" but doesn't assume it's the only key present, so an older or
 * unusually-shaped ladder still yields *some* cover for the download's
 * embedded artwork instead of silently embedding none.
 */
export function pickArtworkUrl(ladder: unknown): string | null {
  if (!ladder || typeof ladder !== "object") return null;
  const entries = Object.entries(ladder as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === "string" && e[1].length > 0,
  );
  if (entries.length === 0) return null;
  entries.sort(([a], [b]) => (Number(b) || 0) - (Number(a) || 0));
  return entries[0][1];
}

/**
 * Fetches the master file, embeds XOLDOUT/artist/artwork metadata (MP3
 * only — see embedDownloadMetadata's own comment), and returns it as a
 * direct file-download NextResponse. Used by both the track and beat
 * audio-url routes for their `?download=1` branch — proxying through our
 * own server (rather than a presigned R2 URL) is what makes editing the
 * file's tags before it reaches the buyer possible at all.
 *
 * Never throws on a tagging failure — a buyer's download should never be
 * blocked by an ffmpeg hiccup; it just falls back to the untagged master.
 */
export async function serveTaggedAudioDownload(args: {
  masterKey: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
}): Promise<NextResponse> {
  const [audioBuffer, artworkBuffer] = await Promise.all([
    getObjectBuffer(args.masterKey),
    args.artworkUrl
      ? fetch(args.artworkUrl)
          .then((r) => {
            if (!r.ok) {
              console.error(`Download artwork fetch failed: ${r.status} ${r.statusText} for ${args.artworkUrl}`);
              return null;
            }
            return r.arrayBuffer().then((b) => Buffer.from(b));
          })
          .catch((err) => {
            console.error(`Download artwork fetch threw for ${args.artworkUrl}`, err);
            return null;
          })
      : Promise.resolve(null),
  ]);

  const isMp3 = args.masterKey.toLowerCase().endsWith(".mp3");
  let output = audioBuffer;
  if (isMp3) {
    try {
      output = await embedDownloadMetadata(audioBuffer, {
        title: args.title,
        artistName: args.artistName,
        artworkBuffer,
      });
    } catch (err) {
      console.error("embedDownloadMetadata failed, serving untagged master", err);
      output = audioBuffer;
    }
  }

  const extension = isMp3 ? "mp3" : args.masterKey.split(".").pop() || "audio";
  const safeTitle = args.title.replace(/["\\/\r\n]/g, "").trim() || "track";
  const filename = `${safeTitle} - XOLDOUT.${extension}`;

  // NextResponse's BodyInit typing doesn't recognize Node's Buffer directly
  // (a DOM-vs-Node type mismatch, not a runtime one — Buffer already *is* a
  // Uint8Array) — wrapping it satisfies the type; the copy is negligible
  // next to the ffmpeg pass this buffer just went through.
  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type": isMp3 ? "audio/mpeg" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(output.length),
    },
  });
}
