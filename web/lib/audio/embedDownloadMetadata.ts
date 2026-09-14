import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { runFfmpeg } from "./ffmpeg";

const SITE_URL = "https://www.xoldout.app";

// Explicit ask: every downloaded song/beat should carry XOLDOUT's name/
// site, the artist/producer's name, and the artwork, embedded in the
// actual file's ID3v2 tags — not just the filename — so it's visible in
// any music player (Files app, iTunes, VLC, a phone's own player) once it
// leaves the platform. MP3-only (the only format ID3v2/APIC is a real
// standard for): a WAV master is served as-is by the caller, never passed
// here. `-c:a copy`/`-c:v copy` re-mux without re-encoding — fast and
// lossless — writing only the tag/picture frames.
//
// Cover art needs its own file on disk: ffmpeg's stdin (`pipe:0`) can only
// carry one input stream, and this needs two (audio + image), so the image
// goes to a real temp file referenced by `-i <path>` instead.
export async function embedDownloadMetadata(
  audioBuffer: Buffer,
  opts: { title: string; artistName: string; artworkBuffer: Buffer | null },
): Promise<Buffer> {
  const args = ["-i", "pipe:0"];
  let imagePath: string | null = null;

  try {
    if (opts.artworkBuffer) {
      imagePath = join(tmpdir(), `xoldout-art-${randomUUID()}.jpg`);
      await writeFile(imagePath, opts.artworkBuffer);
      args.push(
        "-i",
        imagePath,
        "-map",
        "0:a",
        "-map",
        "1:0",
        "-c:a",
        "copy",
        "-c:v",
        "copy",
        "-disposition:v:0",
        "attached_pic",
      );
    } else {
      args.push("-map", "0:a", "-c:a", "copy");
    }

    args.push(
      "-id3v2_version",
      "3",
      "-metadata",
      `title=${opts.title}`,
      "-metadata",
      `artist=${opts.artistName}`,
      "-metadata",
      "album=XOLDOUT",
      "-metadata",
      "album_artist=XOLDOUT",
      "-metadata",
      "publisher=XOLDOUT",
      "-metadata",
      `comment=Downloaded from XOLDOUT - ${SITE_URL}`,
      "-f",
      "mp3",
      "pipe:1",
    );

    return await runFfmpeg(args, audioBuffer);
  } finally {
    if (imagePath) await unlink(imagePath).catch(() => {});
  }
}
