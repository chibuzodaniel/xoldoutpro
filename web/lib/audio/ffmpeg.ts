import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

/** Runs ffmpeg with the given args, feeding `input` on stdin and collecting stdout as a Buffer. */
export function runFfmpeg(args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as unknown as string, args);
    const chunks: Buffer[] = [];
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });

    proc.stdin.write(input);
    proc.stdin.end();
  });
}
