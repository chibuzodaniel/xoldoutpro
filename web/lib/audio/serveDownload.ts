import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { getObjectBuffer, objectExists, presignDownload, putObjectBuffer } from "@/lib/storage/r2";
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

type DownloadArgs = {
  masterKey: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
};

// Bump to force every cached tagged file to regenerate (e.g. after changing
// what embedDownloadMetadata writes).
const TAG_CACHE_VERSION = "v1";

function downloadFilename(args: DownloadArgs, isMp3: boolean) {
  const extension = isMp3 ? "mp3" : args.masterKey.split(".").pop() || "audio";
  const safeTitle = args.title.replace(/["\/\r\n]/g, "").trim() || "track";
  return `${safeTitle} - XOLDOUT.${extension}`;
}

/**
 * The R2 key of the file a buyer should download, producing it on first use.
 *
 * Cost fix (Vercel Active CPU was near the Hobby cap): tagging used to run a
 * full ffmpeg pass on EVERY download. Now the tagged MP3 is generated once
 * and cached in R2 under a key derived from everything that goes into the
 * tags (master, title, artist, artwork) — so a later rename or new cover
 * automatically produces a fresh copy, and every other download is a cheap
 * HEAD. Non-MP3 masters were never tagged; they're served as-is.
 *
 * Never throws on a tagging failure — a buyer's download should never be
 * blocked by an ffmpeg hiccup; it falls back to the untagged master (and
 * doesn't cache that, so the next download retries tagging).
 */
async function ensureDownloadObject(args: DownloadArgs): Promise<{ key: string; filename: string; contentType: string }> {
  const isMp3 = args.masterKey.toLowerCase().endsWith(".mp3");
  const filename = downloadFilename(args, isMp3);
  if (!isMp3) return { key: args.masterKey, filename, contentType: "application/octet-stream" };

  const digest = createHash("sha256")
    .update([TAG_CACHE_VERSION, args.masterKey, args.title, args.artistName, args.artworkUrl ?? ""].join("\u0000"))
    .digest("hex")
    .slice(0, 40);
  const taggedKey = `downloads/tagged/${digest}.mp3`;
  if (await objectExists(taggedKey)) return { key: taggedKey, filename, contentType: "audio/mpeg" };

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

  try {
    const tagged = await embedDownloadMetadata(audioBuffer, { title: args.title, artistName: args.artistName, artworkBuffer });
    await putObjectBuffer(taggedKey, tagged, "audio/mpeg");
    return { key: taggedKey, filename, contentType: "audio/mpeg" };
  } catch (err) {
    console.error("embedDownloadMetadata failed, serving untagged master", err);
    return { key: args.masterKey, filename, contentType: "audio/mpeg" };
  }
}

/**
 * The `?download=1` response for the track and beat audio-url routes.
 *
 * With `link` (the web client): a short-lived signed R2 URL that forces a
 * save with the right filename — the file goes straight from R2 to the
 * buyer instead of streaming through a Vercel function (no function CPU or
 * Fast Origin Transfer for the bytes). Without it (older clients): the
 * bytes, as before — but from the cached tagged copy, so still no repeat
 * ffmpeg pass.
 */
export async function serveTaggedAudioDownload(args: DownloadArgs & { link?: boolean }): Promise<NextResponse> {
  const { key, filename, contentType } = await ensureDownloadObject(args);

  if (args.link) {
    const url = await presignDownload(key, 300, { filename, contentType });
    return NextResponse.json({ url, filename });
  }

  const output = await getObjectBuffer(key);
  // NextResponse's BodyInit typing doesn't recognize Node's Buffer directly
  // (a DOM-vs-Node type mismatch, not a runtime one — Buffer already *is* a
  // Uint8Array) — wrapping it satisfies the type.
  return new NextResponse(new Uint8Array(output), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(output.length),
    },
  });
}
