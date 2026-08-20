"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { ImageCropModal } from "@/components/upload/ImageCropModal";

type TierDraft = { localId: string; name: string; priceNaira: string; hasCap: boolean; capValue: string };

function newTier(name = ""): TierDraft {
  return { localId: crypto.randomUUID(), name, priceNaira: "", hasCap: false, capValue: "" };
}

export default function CreateEventPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [isVirtual, setIsVirtual] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverImageLadder, setCoverImageLadder] = useState<Record<string, string> | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);

  const [tiers, setTiers] = useState<TierDraft[]>([newTier("General")]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateTier(localId: string, patch: Partial<TierDraft>) {
    setTiers((cur) => cur.map((t) => (t.localId === localId ? { ...t, ...patch } : t)));
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
    if (!startsAt) return setError("Set a start date and time");
    if (!isVirtual && !venue.trim()) return setError("Add a venue, or mark this a virtual event");
    if (tiers.length === 0) return setError("Add at least one ticket tier");

    const parsedTiers: { name: string; priceKobo: number; cap: number | null }[] = [];
    for (const t of tiers) {
      if (!t.name.trim()) return setError("Every tier needs a name");
      const priceKobo = Math.round(parseFloat(t.priceNaira || "0") * 100);
      if (!t.priceNaira || priceKobo < 0) return setError(`Set a price for "${t.name}", or 0 for free`);
      const cap = t.hasCap ? parseInt(t.capValue, 10) : null;
      if (t.hasCap && (!t.capValue || !Number.isInteger(cap) || (cap as number) <= 0)) {
        return setError(`Enter a valid quantity for "${t.name}"`);
      }
      parsedTiers.push({ name: t.name.trim(), priceKobo, cap });
    }

    setSubmitting(true);
    try {
      const payload = {
        title,
        description,
        coverImageLadder,
        venue: isVirtual ? undefined : venue,
        isVirtual,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        tiers: parsedTiers,
      };

      const res = await apiFetch("/api/events", { method: "POST", body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not publish event");
      }
      router.push("/profile/catalog/events");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto pb-24">
      <h1 className="font-serif text-2xl mb-6">Create Event</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Cover image</label>
          <label className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-ink-3">Add a cover image</span>
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

        <div className="flex flex-col gap-2">
          <label className="text-[12px] uppercase tracking-widest text-ink-3">Venue</label>
          <div className="flex items-center gap-3 mb-1">
            <button
              type="button"
              onClick={() => setIsVirtual((v) => !v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                isVirtual ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
              }`}
            >
              Virtual event
            </button>
          </div>
          {!isVirtual && (
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Venue name and address"
              className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Starts</label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Ends (optional)</label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-red"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-[12px] uppercase tracking-widest text-ink-3">Ticket tiers</label>
            {tiers.length < 10 && (
              <button type="button" onClick={() => setTiers((cur) => [...cur, newTier()])} className="text-xs text-red-soft">
                + Add tier
              </button>
            )}
          </div>
          {tiers.map((tier) => (
            <div key={tier.localId} className="rounded-xl border border-line bg-surface p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  value={tier.name}
                  onChange={(e) => updateTier(tier.localId, { name: e.target.value })}
                  placeholder="Tier name (e.g. Early Bird)"
                  className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
                />
                {tiers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setTiers((cur) => cur.filter((t) => t.localId !== tier.localId))}
                    className="text-xs text-ink-3 shrink-0"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm text-ink-3">₦</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={tier.priceNaira}
                  onChange={(e) => updateTier(tier.localId, { priceNaira: e.target.value })}
                  placeholder="0 for free"
                  className="w-28 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => updateTier(tier.localId, { hasCap: !tier.hasCap })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    tier.hasCap ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {tier.hasCap ? "Limited" : "Unlimited"}
                </button>
                {tier.hasCap && (
                  <input
                    type="number"
                    min={1}
                    step="1"
                    placeholder="e.g. 100"
                    value={tier.capValue}
                    onChange={(e) => updateTier(tier.localId, { capValue: e.target.value })}
                    className="w-24 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs outline-none transition-colors duration-150 focus:border-red"
                  />
                )}
              </div>
            </div>
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
