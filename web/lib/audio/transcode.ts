import { runFfmpeg } from "./ffmpeg";

// MP3 (not AAC/Opus) chosen for the streaming rendition specifically because
// it has no seek-table/container requirement, so it can be produced and
// played back from a plain byte stream — no moov-atom/faststart problems —
// and it plays everywhere (unlike webm/opus, which iOS Safari does not
// support). Master (original MP3/WAV) is retained separately for downloads.
export async function transcodeToStreamingMp3(input: Buffer): Promise<Buffer> {
  return runFfmpeg(["-i", "pipe:0", "-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"], input);
}
