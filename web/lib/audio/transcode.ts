import { runFfmpeg } from "./ffmpeg";

// MP3 (not AAC/Opus) chosen for the streaming rendition specifically because
// it has no seek-table/container requirement, so it can be produced and
// played back from a plain byte stream — no moov-atom/faststart problems —
// and it plays everywhere (unlike webm/opus, which iOS Safari does not
// support). Master (original MP3/WAV) is retained separately for downloads.
export async function transcodeToStreamingMp3(input: Buffer): Promise<Buffer> {
  return runFfmpeg(["-i", "pipe:0", "-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"], input);
}

// Cuts an actual short clip covering only [startSec, endSec) — this is what
// makes a "preview" a real preview rather than a UI convention. `-ss`/`-t`
// are placed as *output* options (after -i) rather than input options,
// since input-side seeking needs a seekable source and this reads from a
// piped stdin buffer, not a file. Output-side -ss/-t is slower (ffmpeg
// decodes from the start and discards up to the seek point) but that cost
// is trivial for a ~30s preview window.
export async function trimToPreviewMp3(input: Buffer, startSec: number, endSec: number): Promise<Buffer> {
  const duration = Math.max(endSec - startSec, 0.1);
  return runFfmpeg(
    ["-i", "pipe:0", "-ss", String(startSec), "-t", String(duration), "-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
    input,
  );
}
