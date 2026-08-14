import { runFfmpeg } from "./ffmpeg";

// PRD §7.1: waveform peaks are generated server-side at ingest and cached —
// the browser (mid-range Android, intermittent data) never decodes the full
// file to draw the scrubber.
const SAMPLE_RATE = 8000;
const PEAK_COUNT = 800;

export async function generateWaveformPeaks(input: Buffer): Promise<number[]> {
  const pcm = await runFfmpeg(["-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", String(SAMPLE_RATE), "pipe:1"], input);

  const sampleCount = Math.floor(pcm.length / 2);
  const bucketSize = Math.max(1, Math.floor(sampleCount / PEAK_COUNT));
  const peaks: number[] = [];

  for (let bucket = 0; bucket < PEAK_COUNT; bucket++) {
    const start = bucket * bucketSize;
    let max = 0;
    for (let i = start; i < start + bucketSize && i < sampleCount; i++) {
      const sample = Math.abs(pcm.readInt16LE(i * 2));
      if (sample > max) max = sample;
    }
    peaks.push(Number((max / 32768).toFixed(4)));
  }

  return peaks;
}
