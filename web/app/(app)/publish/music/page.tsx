"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { uploadAndIngestAudio } from "@/lib/uploadAudio";
import { TrackUploader, type TrackDraft, effectivePreviewLength } from "@/components/upload/TrackUploader";
import { ImageCropModal } from "@/components/upload/ImageCropModal";

function newTrack(): TrackDraft {
  return {
    localId: crypto.randomUUID(),
    title: "",
    status: "idle",
    previewLength: 30,
    previewLengthCustomSec: 30,
    previewStartSec: 0,
    lyricsText: "",
    description: "",
  };
}

type ReleaseType = "SINGLE" | "EP" | "ALBUM";

export default function UploadMusicPage() {
  const router = useRouter();

  const [releaseType, setReleaseType] = useState<ReleaseType>("SINGLE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isFree, setIsFree] = useState(false);
  const [priceNaira, setPriceNaira] = useState("");
  const [hasCap, setHasCap] = useState(false);
  const [capValue, setCapValue] = useState("");

  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [artworkLadder, setArtworkLadder] = useState<Record<string, string> | null>(null);
  const [artworkUploading, setArtworkUploading] = useState(false);
  const [artworkCropFile, setArtworkCropFile] = useState<File | null>(null);

  const [tracks, setTracks] = useState<TrackDraft[]>([newTrack()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateTrack(localId: string, patch: Partial<TrackDraft>) {
    setTracks((cur) => cur.map((t) => (t.localId === localId ? { ...t, ...patch } : t)));
  }

  function setReleaseTypeChecked(type: ReleaseType) {
    setReleaseType(type);
    if (type === "SINGLE" && tracks.length > 1) setTracks([tracks[0]]);
  }

  async function handleFileSelected(localId: string, file: File) {
    updateTrack(localId, { status: "uploading" });
    try {
      const result = await uploadAndIngestAudio(file);
      const defaultLength = result.durationSec >= 30 ? 30 : "custom";
      updateTrack(localId, {
        status: "ready",
        durationSec: result.durationSec,
        peaks: result.peaks,
        audioMasterKey: result.audioMasterKey,
        audioStreamKey: result.audioStreamKey,
        waveformPeaksKey: result.waveformPeaksKey,
        previewLength: defaultLength,
        previewLengthCustomSec: Math.min(30, result.durationSec),
        previewStartSec: result.previewDefaults.start,
      });
    } catch (err) {
      updateTrack(localId, { status: "error", error: err instanceof Error ? err.message : "Upload failed" });
    }
  }

  async function handleArtworkSelected(file: File) {
    setArtworkPreview(URL.createObjectURL(file));
    setArtworkUploading(true);
    setError(null);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not process artwork");
      const data = await res.json();
      setArtworkLadder(data.artworkLadder);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Artwork upload failed");
    } finally {
      setArtworkUploading(false);
    }
  }

  const canAddTrack = releaseType !== "SINGLE" && tracks.length < 30;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!artworkLadder) return setError("Add artwork before publishing");
    if (tracks.some((t) => t.status !== "ready")) return setError("Every track needs to finish uploading first");
    if (releaseType === "SINGLE" && tracks.length !== 1) return setError("A single needs exactly one track");

    const priceKobo = isFree ? 0 : Math.round(parseFloat(priceNaira || "0") * 100);
    if (!isFree && (!priceNaira || priceKobo <= 0)) return setError("Set a price, or mark this release free");
    const cap = hasCap ? parseInt(capValue, 10) : null;
    if (hasCap && (!capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
      return setError("Enter a valid limited quantity");
    }

    setSubmitting(true);
    try {
      const payload = {
        title,
        releaseType,
        description,
        priceKobo,
        cap,
        artworkLadder,
        tracks: tracks.map((t, order) => {
          const length = effectivePreviewLength(t);
          return {
            title: t.title || title,
            description: t.description || undefined,
            order,
            audioMasterKey: t.audioMasterKey,
            audioStreamKey: t.audioStreamKey,
            waveformPeaksKey: t.waveformPeaksKey,
            durationSec: t.durationSec,
            previewStartSec: t.previewStartSec,
            previewEndSec: t.previewStartSec + length,
            lyricsText: t.lyricsText || undefined,
          };
        }),
      };

      const res = await apiFetch("/api/releases", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not publish release");
      }
      router.push("/profile/catalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-24">
      <h1 className="font-serif text-2xl mb-6">Upload Music</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex gap-2">
          {(["SINGLE", "EP", "ALBUM"] as const).map((type) => (
            <button
              type="button"
              key={type}
              onClick={() => setReleaseTypeChecked(type)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                releaseType === type ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              {type === "SINGLE" ? "Single" : type === "EP" ? "EP" : "Album"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Artwork</label>
          <label className="flex h-32 w-32 items-center justify-center rounded-lg border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
            {artworkPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={artworkPreview} alt="Artwork preview" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-ink-3">Add square artwork</span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setArtworkCropFile(file);
                e.target.value = "";
              }}
            />
          </label>
          {artworkUploading && <p className="text-xs text-ink-3">Processing artwork…</p>}

          {artworkCropFile && (
            <ImageCropModal
              file={artworkCropFile}
              aspect={1}
              outputWidth={1024}
              outputHeight={1024}
              onCancel={() => setArtworkCropFile(null)}
              onConfirm={(cropped) => {
                setArtworkCropFile(null);
                handleArtworkSelected(cropped);
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red resize-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Price</label>
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
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Limited quantity</label>
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
                placeholder="e.g. 500"
                value={capValue}
                onChange={(e) => setCapValue(e.target.value)}
                className="w-28 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
              />
            )}
          </div>
          {hasCap && (
            <p className="text-[10.5px] text-ink-3">
              Once it sells out it stays sold out — the cap can be lowered later but never raised.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-widest text-ink-3">Tracks</label>
            {canAddTrack && (
              <button type="button" onClick={() => setTracks((cur) => [...cur, newTrack()])} className="text-xs text-red-soft">
                + Add track
              </button>
            )}
          </div>
          {tracks.map((track, i) => (
            <TrackUploader
              key={track.localId}
              track={track}
              index={i}
              onFileSelected={(file) => handleFileSelected(track.localId, file)}
              onChange={(patch) => updateTrack(track.localId, patch)}
              onRemove={
                tracks.length > 1 ? () => setTracks((cur) => cur.filter((t) => t.localId !== track.localId)) : undefined
              }
            />
          ))}
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
