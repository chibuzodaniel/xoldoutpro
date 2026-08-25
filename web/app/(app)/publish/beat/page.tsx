"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { uploadAndIngestAudio } from "@/lib/uploadAudio";
import { WaveformScrubber } from "@/components/upload/WaveformScrubber";
import { ImageCropModal } from "@/components/upload/ImageCropModal";

type AudioState = {
  status: "idle" | "uploading" | "ready" | "error";
  error?: string;
  durationSec?: number;
  peaks?: number[];
  audioMasterKey?: string;
  audioStreamKey?: string;
  waveformPeaksKey?: string;
};

function effectivePreviewLength(durationSec: number, length: 30 | 50 | "custom", customSec: number) {
  const raw = length === "custom" ? customSec : length;
  return Math.min(Math.max(raw, 5), durationSec);
}

export default function UploadBeatPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [priceNaira, setPriceNaira] = useState("");
  const [hasCap, setHasCap] = useState(false);
  const [capValue, setCapValue] = useState("");
  const [bpm, setBpm] = useState("");
  const [musicalKey, setMusicalKey] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverImageLadder, setCoverImageLadder] = useState<Record<string, string> | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);

  const [audio, setAudio] = useState<AudioState>({ status: "idle" });
  const [previewLength, setPreviewLength] = useState<30 | 50 | "custom">(30);
  const [previewLengthCustomSec, setPreviewLengthCustomSec] = useState(30);
  const [previewStartSec, setPreviewStartSec] = useState(0);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addTag() {
    const t = tagInput.trim();
    if (!t || tags.includes(t) || tags.length >= 8) return;
    setTags((cur) => [...cur, t]);
    setTagInput("");
  }

  async function handleAudioSelected(file: File) {
    setAudio({ status: "uploading" });
    try {
      const result = await uploadAndIngestAudio(file);
      setAudio({
        status: "ready",
        durationSec: result.durationSec,
        peaks: result.peaks,
        audioMasterKey: result.audioMasterKey,
        audioStreamKey: result.audioStreamKey,
        waveformPeaksKey: result.waveformPeaksKey,
      });
      setPreviewLength(result.durationSec >= 30 ? 30 : "custom");
      setPreviewLengthCustomSec(Math.min(30, result.durationSec));
      setPreviewStartSec(result.previewDefaults.start);
    } catch (err) {
      setAudio({ status: "error", error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  async function handleCoverSelected(file: File) {
    setCoverPreview(URL.createObjectURL(file));
    setCoverUploading(true);
    setError(null);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not process cover image");
      const data = await res.json();
      setCoverImageLadder(data.artworkLadder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!coverImageLadder) return setError("Add a cover image before publishing");
    if (audio.status !== "ready" || !audio.durationSec || !audio.peaks) {
      return setError("Upload the beat's audio file first");
    }

    const priceKobo = isFree ? 0 : Math.round(parseFloat(priceNaira || "0") * 100);
    if (!isFree && (!priceNaira || priceKobo <= 0)) return setError("Set a price, or mark this beat free");
    const cap = hasCap ? parseInt(capValue, 10) : null;
    if (hasCap && (!capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
      return setError("Enter a valid limited quantity");
    }

    const length = effectivePreviewLength(audio.durationSec, previewLength, previewLengthCustomSec);

    setSubmitting(true);
    try {
      const payload = {
        title,
        description,
        priceKobo,
        cap,
        coverImageLadder,
        audioMasterKey: audio.audioMasterKey,
        audioStreamKey: audio.audioStreamKey,
        waveformPeaksKey: audio.waveformPeaksKey,
        durationSec: audio.durationSec,
        previewStartSec,
        previewEndSec: previewStartSec + length,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        musicalKey: musicalKey || undefined,
        tags,
      };

      const res = await apiFetch("/api/beats", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not publish beat");
      }
      router.push("/profile/catalog/beats");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-24">
      <h1 className="font-serif text-2xl mb-6">Upload Beat</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Cover art</label>
          <div className="relative h-32 w-32">
            <label className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
              {coverPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xs text-ink-3">Add square cover art</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setCoverCropFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            {coverPreview && !coverUploading && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("This cover art will be permanently deleted. Continue?")) return;
                  setCoverPreview(null);
                  setCoverImageLadder(null);
                }}
                aria-label="Delete cover art"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/70 text-white text-xs flex items-center justify-center"
              >
                ×
              </button>
            )}
          </div>
          {coverUploading && <p className="text-xs text-ink-3">Processing cover…</p>}

          {coverCropFile && (
            <ImageCropModal
              file={coverCropFile}
              aspect={1}
              outputWidth={1024}
              outputHeight={1024}
              onCancel={() => setCoverCropFile(null)}
              onConfirm={(cropped) => {
                setCoverCropFile(null);
                handleCoverSelected(cropped);
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red resize-none"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">BPM (optional)</label>
            <input
              type="number"
              min={1}
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Key (optional)</label>
            <input
              value={musicalKey}
              onChange={(e) => setMusicalKey(e.target.value)}
              placeholder="e.g. C minor"
              maxLength={10}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Tags</label>
          <div className="flex flex-wrap gap-2 mb-1">
            {tags.map((tag) => (
              <span key={tag} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs">
                {tag}
                <button
                  type="button"
                  onClick={() => setTags((cur) => cur.filter((t) => t !== tag))}
                  className="text-ink-3"
                  aria-label={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="e.g. Afrobeats, Trap"
              maxLength={24}
              className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
            <button type="button" onClick={addTag} className="rounded-lg border border-line px-4 text-sm font-semibold">
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Price</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsFree((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                isFree ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              Free
            </button>
            {!isFree && (
              <div className="flex items-center gap-1">
                <span className="text-sm text-ink-3">₦</span>
                <input
                  type="number"
                  min={1}
                  step="1"
                  value={priceNaira}
                  onChange={(e) => setPriceNaira(e.target.value)}
                  className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
                />
              </div>
            )}
          </div>
          <p className="text-[10.5px] text-ink-3">
            One price, full commercial-use license — buyers get the master file, forever.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Limited quantity</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHasCap((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                hasCap ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              {hasCap ? "Capped" : "Unlimited"}
            </button>
            {hasCap && (
              <input
                type="number"
                min={1}
                step="1"
                placeholder="e.g. 50"
                value={capValue}
                onChange={(e) => setCapValue(e.target.value)}
                className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Audio file</label>
            {audio.status === "ready" && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("This audio file will be permanently deleted. Continue?")) return;
                  setAudio({ status: "idle" });
                }}
                className="text-xs text-ink-3"
              >
                Delete
              </button>
            )}
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            {audio.status === "idle" && (
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,.mp3,.wav"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAudioSelected(file);
                }}
                className="text-xs text-ink-2"
              />
            )}
            {audio.status === "uploading" && <p className="text-xs text-ink-3">Uploading and processing…</p>}
            {audio.status === "error" && (
              <div>
                <p className="text-xs text-red-soft mb-2">{audio.error}</p>
                <input
                  type="file"
                  accept="audio/mpeg,audio/wav,audio/x-wav,audio/wave,.mp3,.wav"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAudioSelected(file);
                  }}
                  className="text-xs text-ink-2"
                />
              </div>
            )}
            {audio.status === "ready" && audio.peaks && audio.durationSec !== undefined && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  {[30, 50, "custom"].map((opt) => (
                    <button
                      type="button"
                      key={String(opt)}
                      onClick={() => setPreviewLength(opt as 30 | 50 | "custom")}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        previewLength === opt ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {opt === "custom" ? "Custom" : `${opt}s`}
                    </button>
                  ))}
                  {previewLength === "custom" && (
                    <input
                      type="number"
                      min={5}
                      max={Math.floor(audio.durationSec)}
                      value={previewLengthCustomSec}
                      onChange={(e) => setPreviewLengthCustomSec(Number(e.target.value))}
                      className="w-20 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs"
                    />
                  )}
                </div>

                <div>
                  <p className="text-[12px] uppercase tracking-widest text-ink-3 mb-2">
                    Drag to choose the preview window
                  </p>
                  <WaveformScrubber
                    peaks={audio.peaks}
                    durationSec={audio.durationSec}
                    previewLengthSec={effectivePreviewLength(audio.durationSec, previewLength, previewLengthCustomSec)}
                    startSec={previewStartSec}
                    onStartChange={setPreviewStartSec}
                  />
                  <p className="text-[11px] text-ink-3 mt-1">
                    {previewStartSec.toFixed(1)}s –{" "}
                    {(previewStartSec + effectivePreviewLength(audio.durationSec, previewLength, previewLengthCustomSec)).toFixed(1)}s
                    of {audio.durationSec.toFixed(0)}s
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-soft">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Publishing…" : "Publish"}
        </button>
      </form>
    </div>
  );
}
