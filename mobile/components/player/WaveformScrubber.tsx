import { useEffect, useRef, useState } from "react";
import { PanResponder, View, StyleSheet } from "react-native";
import type { WaveformSource } from "../../lib/PlayerContext";
import { colors } from "../../lib/theme";

const BAR_COUNT = 56;

// Peaks per track for the life of the app session — the signed URL changes
// on every play, the waveform doesn't.
const peaksCache = new Map<string, number[]>();

function downsample(peaks: number[], startFrac = 0, endFrac = 1): number[] {
  const from = Math.floor(peaks.length * startFrac);
  const to = Math.max(from + 1, Math.ceil(peaks.length * endFrac));
  const slice = peaks.slice(from, to);
  const step = slice.length / BAR_COUNT;
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    let max = 0;
    const a = Math.floor(i * step);
    const b = Math.max(Math.floor((i + 1) * step), a + 1);
    for (let j = a; j < b && j < slice.length; j++) max = Math.max(max, slice[j]);
    bars.push(max);
  }
  const top = Math.max(...bars, 0.0001);
  return bars.map((v) => Math.max(0.08, v / top));
}

/** Stand-in shape (offline, or no stored peaks) — stable per track. */
function placeholderBars(seed: string): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    h = (h * 1664525 + 1013904223) >>> 0;
    const wave = 0.55 + 0.35 * Math.sin(i / 5);
    return Math.max(0.12, Math.min(1, wave * (0.6 + (h % 1000) / 2500)));
  });
}

// Mirrors web's components/player/WaveformScrubber.tsx: the track's real
// waveform, played part bright, with a thin red playhead. Tap or drag to seek.
export function WaveformScrubber({
  trackId,
  source,
  progress,
  onSeekFraction,
}: {
  trackId: string;
  source: WaveformSource | null;
  progress: number;
  onSeekFraction: (fraction: number) => void;
}) {
  const [bars, setBars] = useState<number[]>(() => placeholderBars(trackId));
  const [dragFrac, setDragFrac] = useState<number | null>(null);
  const widthRef = useRef(1);
  const seekRef = useRef(onSeekFraction);
  seekRef.current = onSeekFraction;

  useEffect(() => {
    let cancelled = false;
    const fallback = placeholderBars(trackId);
    if (!source || source.trackId !== trackId) {
      setBars(fallback);
      return;
    }
    const apply = (peaks: number[]) => !cancelled && setBars(downsample(peaks, source.startFrac, source.endFrac));
    const cached = peaksCache.get(trackId);
    if (cached) apply(cached);
    else {
      setBars(fallback);
      fetch(source.url)
        .then((r) => (r.ok ? r.json() : null))
        .then((peaks: unknown) => {
          if (Array.isArray(peaks) && peaks.length > 0) {
            peaksCache.set(trackId, peaks as number[]);
            apply(peaks as number[]);
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [trackId, source]);

  const fracAt = (x: number) => Math.min(Math.max(x / widthRef.current, 0), 1);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setDragFrac(fracAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => setDragFrac(fracAt(e.nativeEvent.locationX)),
      onPanResponderRelease: (e) => {
        seekRef.current(fracAt(e.nativeEvent.locationX));
        setDragFrac(null);
      },
      onPanResponderTerminate: () => setDragFrac(null),
    }),
  ).current;

  const shown = Math.min(Math.max(dragFrac ?? progress, 0), 1);

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        widthRef.current = Math.max(1, e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
    >
      <View style={styles.bars} pointerEvents="none">
        {bars.map((h, i) => (
          <View key={i} style={[styles.bar, { height: `${Math.round(h * 100)}%`, backgroundColor: (i + 0.5) / bars.length <= shown ? "#fff" : "rgba(255,255,255,0.3)" }]} />
        ))}
      </View>
      <View pointerEvents="none" style={[styles.playhead, { left: `${shown * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 56, justifyContent: "center" },
  bars: { flexDirection: "row", alignItems: "center", height: "100%", gap: 2 },
  bar: { flex: 1, borderRadius: 2 },
  playhead: { position: "absolute", top: 0, bottom: 0, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: colors.redSoft },
});
