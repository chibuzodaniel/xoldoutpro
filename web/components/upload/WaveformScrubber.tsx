"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  peaks: number[];
  durationSec: number;
  previewLengthSec: number;
  startSec: number;
  onStartChange: (startSec: number) => void;
};

const HEIGHT = 88;
const BAR_GAP = 1;

/**
 * PRD §7.1: the artist picks *which part* of the track previews by dragging
 * a fixed-width window across a server-generated waveform. This never
 * decodes the audio file itself — `peaks` is precomputed on ingest.
 */
export function WaveformScrubber({ peaks, durationSec, previewLengthSec, startSec, onStartChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const dragState = useRef<{ dragging: boolean; pointerOffsetPx: number }>({ dragging: false, pointerOffsetPx: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const windowWidthPx = width > 0 ? (previewLengthSec / durationSec) * width : 0;
  const windowLeftPx = width > 0 ? (startSec / durationSec) * width : 0;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);

    const barWidth = width / peaks.length;
    ctx.fillStyle = "#3a3a42";
    peaks.forEach((peak, i) => {
      const barHeight = Math.max(2, peak * HEIGHT);
      const x = i * barWidth;
      ctx.fillRect(x, (HEIGHT - barHeight) / 2, Math.max(1, barWidth - BAR_GAP), barHeight);
    });
  }, [peaks, width]);

  useEffect(() => draw(), [draw]);

  function clampStart(px: number) {
    const maxLeftPx = width - windowWidthPx;
    const clampedPx = Math.min(Math.max(px, 0), Math.max(maxLeftPx, 0));
    const newStart = (clampedPx / width) * durationSec;
    onStartChange(Number(newStart.toFixed(2)));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = containerRef.current!.getBoundingClientRect();
    const pointerXPx = e.clientX - rect.left;
    dragState.current = { dragging: true, pointerOffsetPx: pointerXPx - windowLeftPx };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current.dragging) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const pointerXPx = e.clientX - rect.left;
    clampStart(pointerXPx - dragState.current.pointerOffsetPx);
  }

  function onPointerUp() {
    dragState.current.dragging = false;
  }

  return (
    <div ref={containerRef} className="relative select-none touch-none" style={{ height: HEIGHT }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: HEIGHT }} className="block" />
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute top-0 bottom-0 rounded-md border-2 border-red bg-red/15 cursor-grab active:cursor-grabbing"
        style={{ left: windowLeftPx, width: Math.max(windowWidthPx, 8) }}
      />
    </div>
  );
}
