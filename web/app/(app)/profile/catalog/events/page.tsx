"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { uploadImage } from "@/lib/uploadImage";
import { ImageCropModal } from "@/components/upload/ImageCropModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { BackHeader } from "@/components/ui/BackHeader";
import { useToast } from "@/components/ui/ToastProvider";

type CatalogTier = {
  productId: string;
  name: string;
  product: {
    priceKobo: number;
    publishedAt: string | null;
    stockPolicy: { cap: number | null; sold: number; soldOutAt: string | null } | null;
  };
};

type CatalogEvent = {
  id: string;
  title: string;
  description: string;
  venue: string | null;
  startsAt: string;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  publishedAt: string | null;
  coverImageLadder: unknown;
  tiers: CatalogTier[];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Tiers are frozen once created — a buyer's receipt should always match
// what they saw at purchase, so the only mutation left is pulling one off
// sale entirely (see the API's DELETE). Changing a price or adding stock
// happens by adding a new tier instead (NewTierForm below).
function TierRow({ eventId, tier, onDeleted }: { eventId: string; tier: CatalogTier; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const hasCap = tier.product.stockPolicy?.cap != null;
  const sold = tier.product.stockPolicy?.sold ?? 0;

  async function handleDelete() {
    if (!confirm(`Take "${tier.name}" off sale? Anyone who already bought this tier keeps their ticket — this is not a refund.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/tiers/${tier.productId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not delete tier");
      }
      toast.success("Tier removed from sale.");
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <span className="text-xs font-semibold">{tier.name}</span>
        <p className="text-[11px] text-ink-3">
          {formatNaira(tier.product.priceKobo)} · {sold} sold{hasCap ? ` of ${tier.product.stockPolicy?.cap}` : ""}
        </p>
      </div>
      <button onClick={handleDelete} disabled={busy} className="text-[11px] text-ink-3 uppercase tracking-widest disabled:opacity-50">
        {busy ? "Removing…" : "Delete"}
      </button>
    </div>
  );
}

function NewTierForm({ eventId, onAdded }: { eventId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [hasCap, setHasCap] = useState(false);
  const [capValue, setCapValue] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleAdd() {
    if (!name.trim()) return toast.error("Give the tier a name");
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100);
    if (!priceNaira || Number.isNaN(priceKobo) || priceKobo < 0) return toast.error("Set a price, or 0 for free");
    const cap = hasCap ? parseInt(capValue, 10) : null;
    if (hasCap && (!capValue || !Number.isInteger(cap) || (cap as number) <= 0)) return toast.error("Enter a valid quantity");

    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/tiers`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), priceKobo, cap }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not add tier");
      }
      toast.success("Tier added.");
      setName("");
      setPriceNaira("");
      setHasCap(false);
      setCapValue("");
      setOpen(false);
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="py-3 text-xs text-red-soft font-semibold text-left">
        + Add tier
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tier name (e.g. Early Bird)"
        className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-semibold outline-none transition-colors duration-150 focus:border-red"
      />
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-3">₦</span>
          <input
            type="number"
            min={0}
            step="1"
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            placeholder="0 for free"
            className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none transition-colors duration-150 focus:border-red"
          />
        </div>
        <button
          type="button"
          onClick={() => setHasCap((v) => !v)}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ${
            hasCap ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2"
          }`}
        >
          {hasCap ? "Limited" : "Unlimited"}
        </button>
        {hasCap && (
          <input
            type="number"
            min={1}
            step="1"
            value={capValue}
            onChange={(e) => setCapValue(e.target.value)}
            placeholder="e.g. 100"
            className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none transition-colors duration-150 focus:border-red"
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleAdd} disabled={busy} className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? "Adding…" : "Add tier"}
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-ink-3">
          Cancel
        </button>
      </div>
    </div>
  );
}

function EventEditor({ event, onSaved }: { event: CatalogEvent; onSaved: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [venue, setVenue] = useState(event.venue ?? "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const currentCover = (event.coverImageLadder as Record<string, string> | undefined)?.["1024"];
  const [coverPreview, setCoverPreview] = useState<string | null>(currentCover ?? null);
  const [coverImageLadder, setCoverImageLadder] = useState<Record<string, string> | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverCropFile, setCoverCropFile] = useState<File | null>(null);

  async function handleCoverSelected(file: File) {
    setCoverPreview(URL.createObjectURL(file));
    setCoverUploading(true);
    try {
      const key = await uploadImage(file, "artwork");
      const res = await apiFetch("/api/uploads/artwork/finalize", { method: "POST", body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error("Could not process cover image");
      const data = await res.json();
      setCoverImageLadder(data.artworkLadder);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cover upload failed");
    } finally {
      setCoverUploading(false);
    }
  }

  async function handleSave() {
    const body: { title?: string; description?: string; venue?: string; coverImageLadder?: Record<string, string> } = {};
    if (title.trim() && title !== event.title) body.title = title.trim();
    if (description !== event.description) body.description = description;
    if (venue !== (event.venue ?? "")) body.venue = venue;
    if (coverImageLadder) body.coverImageLadder = coverImageLadder;
    if (Object.keys(body).length === 0) return;

    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${event.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not save");
      }
      toast.success("Event saved.");
      setCoverImageLadder(null);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pb-3 mb-1 border-b border-line-soft">
      <div className="relative h-24 w-24">
        <label className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-line bg-surface cursor-pointer overflow-hidden">
          {coverPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverPreview} alt="Cover preview" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] text-ink-3 text-center px-1">Add cover</span>
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
        {coverUploading && <p className="text-[10px] text-ink-3 mt-1">Processing…</p>}
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
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-red"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        className="rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none transition-colors duration-150 focus:border-red resize-none"
      />
      <div className="flex items-center gap-2">
        <input
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="Venue"
          className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs outline-none transition-colors duration-150 focus:border-red"
        />
        <button
          onClick={handleSave}
          disabled={busy}
          className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 shrink-0"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export default function EventCatalogPage() {
  const toast = useToast();
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch("/api/events");
    if (res.ok) setEvents((await res.json()).events);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this event? It comes off sale and every discovery surface immediately, and every ticket tier goes with it. Anyone who already bought a ticket keeps it — this is not a refund.")) {
      return;
    }
    const res = await apiFetch(`/api/events/${id}`, { method: "DELETE" });
    if (res.ok) {
      load();
      toast.success("Event deleted.");
    } else {
      toast.error("Could not delete event");
    }
  }

  return (
    <div className="pb-6">
      <BackHeader
        title="Events"
        action={
          <Link href="/publish/event" className="text-xs text-red-soft font-semibold shrink-0">
            + New event
          </Link>
        }
      />
      <div className="px-4">

      {events === null ? (
        <LoadingSpinner full size="md" />
      ) : events.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing published yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {events.map((ev) => {
            const cover = (ev.coverImageLadder as Record<string, string> | undefined)?.["64"];
            const sold = ev.tiers.reduce((sum, t) => sum + (t.product.stockPolicy?.sold ?? 0), 0);
            const isManaging = managingId === ev.id;
            return (
              <div key={ev.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-surface-2 shrink-0 overflow-hidden">
                    <FallbackImg src={cover} alt={ev.title} className="h-full w-full object-cover" fallback={null} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/e/${ev.id}`} className="text-sm font-semibold line-clamp-1">
                      {ev.title}
                    </Link>
                    <p className="text-xs text-ink-3">
                      {ev.status === "DELETED" ? "Deleted · " : ""}
                      {formatDate(ev.startsAt)} · {sold} sold · from {formatNaira(Math.min(...ev.tiers.map((t) => t.product.priceKobo)))}
                    </p>
                  </div>
                  {ev.status !== "DELETED" && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => setManagingId(isManaging ? null : ev.id)}
                        className="text-xs text-red-soft font-semibold"
                      >
                        {isManaging ? "Close" : "Manage"}
                      </button>
                      <Link href={`/profile/catalog/events/${ev.id}/checkin`} className="text-xs text-red-soft font-semibold">
                        Check in
                      </Link>
                      <button onClick={() => handleDelete(ev.id)} className="text-xs text-ink-3">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {isManaging && (
                  <div className="mt-2 ml-[52px] pl-3 border-l border-line-soft flex flex-col">
                    <EventEditor event={ev} onSaved={load} />
                    <div className="flex flex-col divide-y divide-line-soft">
                      {ev.tiers.map((tier) => (
                        <TierRow key={tier.productId} eventId={ev.id} tier={tier} onDeleted={load} />
                      ))}
                      <NewTierForm eventId={ev.id} onAdded={load} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
