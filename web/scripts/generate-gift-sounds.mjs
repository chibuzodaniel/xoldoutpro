// Generates the Live gift celebration sounds (explicit ask, 2026-10-04: "when
// someone sends a gift there should be a sound like celebration of the
// gift"). Synthesized here rather than sourced, so there's no licensing
// question: a short bell arpeggio for small gifts and a brass-style fanfare
// with sparkles for big ones. Writes 16-bit mono WAVs to web/public/sounds
// and mobile/assets/sounds. Re-run with: node web/scripts/generate-gift-sounds.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22050;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const note = (name) => {
  const names = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const semis = names[name[0]] + (Number(name.slice(1)) + 1) * 12;
  return 440 * 2 ** ((semis - 69) / 12);
};

function render(seconds, voices) {
  const buf = new Float32Array(Math.ceil(seconds * SAMPLE_RATE));
  for (const v of voices) {
    const start = Math.floor(v.at * SAMPLE_RATE);
    const length = Math.floor(v.length * SAMPLE_RATE);
    for (let i = 0; i < length && start + i < buf.length; i++) {
      const t = i / SAMPLE_RATE;
      const attack = Math.min(1, t / (v.attack ?? 0.005));
      const env = attack * Math.exp(-t * (v.decay ?? 4));
      let s = 0;
      for (const [harmonic, amp] of v.partials) s += amp * Math.sin(2 * Math.PI * v.freq * harmonic * t);
      buf[start + i] += s * env * v.gain;
    }
  }
  // Normalize to -1 dBFS and add a short fade-out so nothing clicks.
  let peak = 0;
  for (const x of buf) peak = Math.max(peak, Math.abs(x));
  const scale = peak > 0 ? 0.89 / peak : 1;
  const fade = Math.floor(0.05 * SAMPLE_RATE);
  for (let i = 0; i < buf.length; i++) {
    buf[i] *= scale * (i > buf.length - fade ? (buf.length - i) / fade : 1);
  }
  return buf;
}

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((x, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const BELL = [
  [1, 1],
  [2, 0.35],
  [3.01, 0.12],
  [4.2, 0.06],
];
const BRASS = [
  [1, 1],
  [2, 0.6],
  [3, 0.4],
  [4, 0.25],
  [5, 0.15],
  [6, 0.08],
];

// Small gifts (Star, Mic): a quick, bright rising bell arpeggio.
const small = render(1.1, [
  ...["C6", "E6", "G6", "C7"].map((n, i) => ({ freq: note(n), at: i * 0.07, length: 0.9, decay: 5, gain: 0.5, partials: BELL })),
  { freq: note("E7"), at: 0.32, length: 0.6, decay: 7, gain: 0.25, partials: BELL },
]);

// Big gifts (Money Spray, Grammy): a fanfare — rising brass arpeggio into a
// held major chord, with sparkles on top.
const sparkleNotes = ["C7", "G7", "E7", "C8", "G7", "E8", "C8"];
const big = render(2.3, [
  ...["C4", "E4", "G4"].map((n, i) => ({ freq: note(n), at: i * 0.11, length: 0.35, attack: 0.02, decay: 3, gain: 0.45, partials: BRASS })),
  ...["C4", "E4", "G4", "C5"].map((n) => ({ freq: note(n), at: 0.33, length: 1.9, attack: 0.03, decay: 1.6, gain: 0.35, partials: BRASS })),
  ...sparkleNotes.map((n, i) => ({ freq: note(n), at: 0.36 + i * 0.12, length: 0.5, decay: 8, gain: 0.18, partials: BELL })),
]);

for (const dir of [join(root, "web", "public", "sounds"), join(root, "mobile", "assets", "sounds")]) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "gift-small.wav"), toWav(small));
  writeFileSync(join(dir, "gift-big.wav"), toWav(big));
}
console.log("wrote gift-small.wav and gift-big.wav");
