"use client";

import { WaveformScrubber } from "./WaveformScrubber";

export type TrackDraft = {
  localId: string;
  title: string;
  status: "idle" | "uploading" | "ready" | "error";
  error?: string;
  durationSec?: number;
  peaks?: number[];
  audioMasterKey?: string;
  audioStreamKey?: string;
  waveformPeaksKey?: string;
  previewLength: 30 | 50 | "custom";
  previewLengthCustomSec: number;
  previewStartSec: number;
  lyricsText: string;
  description: string;
};

export function effectivePreviewLength(track: TrackDraft) {
  const raw = track.previewLength === "custom" ? track.previewLengthCustomSec : track.previewLength;
  return Math.min(Math.max(raw, 5), track.durationSec ?? raw);
}

type Props = {
  track: TrackDraft;
  index: number;
  onFileSelected: (file: File) => void;
  onChange: (patch: Partial<TrackDraft>) => void;
  onRemove?: () => void;
};

export function TrackUploader({ track, index, onFileSelected, onChange, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-widest text-ink-3">Track {index + 1}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-ink-3">
            Remove
          </button>
        )}
      </div>

      {track.status === "idle" && (
        <input
          type="file"
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,.mp3,.wav"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileSelected(file);
          }}
          className="text-xs text-ink-2"
        />
      )}

      {track.status === "uploading" && <p className="text-xs text-ink-3">Uploading and processing…</p>}

      {track.status === "error" && (
        <div>
          <p className="text-xs text-red-soft mb-2">{track.error}</p>
          <input
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,.mp3,.wav"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelected(file);
            }}
            className="text-xs text-ink-2"
          />
        </div>
      )}

      {track.status === "ready" && track.peaks && track.durationSec && (
        <div className="flex flex-col gap-3">
          <input
            value={track.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Track title"
            required
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
          />

          <input
            value={track.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Short preview description (shown next to the play button)"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs outline-none transition-colors duration-150 focus:border-red"
          />

          <div className="flex items-center gap-2">
            {[30, 50, "custom"].map((opt) => (
              <button
                type="button"
                key={String(opt)}
                onClick={() => onChange({ previewLength: opt as 30 | 50 | "custom" })}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                  track.previewLength === opt
                    ? "border-red text-red-soft bg-red/10"
                    : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
                }`}
              >
                {opt === "custom" ? "Custom" : `${opt}s`}
              </button>
            ))}
            {track.previewLength === "custom" && (
              <input
                type="number"
                min={5}
                max={Math.floor(track.durationSec)}
                value={track.previewLengthCustomSec}
                onChange={(e) => onChange({ previewLengthCustomSec: Number(e.target.value) })}
                className="w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs"
              />
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-widest text-ink-3 mb-2">
              Drag to choose the preview window
            </p>
            <WaveformScrubber
              peaks={track.peaks}
              durationSec={track.durationSec}
              previewLengthSec={effectivePreviewLength(track)}
              startSec={track.previewStartSec}
              onStartChange={(startSec) => onChange({ previewStartSec: startSec })}
            />
            <p className="text-[10px] text-ink-3 mt-1">
              {track.previewStartSec.toFixed(1)}s – {(track.previewStartSec + effectivePreviewLength(track)).toFixed(1)}s
              of {track.durationSec.toFixed(0)}s
            </p>
          </div>

          <textarea
            value={track.lyricsText}
            onChange={(e) => onChange({ lyricsText: e.target.value })}
            placeholder="Lyrics (optional)"
            rows={2}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs outline-none transition-colors duration-150 focus:border-red resize-none"
          />
        </div>
      )}
    </div>
  );
}
