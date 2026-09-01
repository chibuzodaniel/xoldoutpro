"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { isWithinEditWindow, EDIT_WINDOW_HOURS } from "@/lib/editWindow";
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

function TierEditor({ eventId, tier, onSaved }: { eventId: string; tier: CatalogTier; onSaved: () => void }) {
  const [name, setName] = useState(tier.name);
  const [priceNaira, setPriceNaira] = useState(String(tier.product.priceKobo / 100));
  const [capValue, setCapValue] = useState(tier.product.stockPolicy?.cap != null ? String(tier.product.stockPolicy.cap) : "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const hasCap = tier.product.stockPolicy?.cap != null;
  const sold = tier.product.stockPolicy?.sold ?? 0;
  const editable = isWithinEditWindow(tier.product.publishedAt);

  async function handleSave() {
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100);
    const body: { name?: string; priceKobo?: number; cap?: number } = {};
    if (name.trim() && name !== tier.name) body.name = name.trim();
    if (!Number.isNaN(priceKobo) && priceKobo !== tier.product.priceKobo) body.priceKobo = priceKobo;
    if (hasCap) {
      const cap = parseInt(capValue, 10);
      if (Number.isInteger(cap) && cap !== tier.product.stockPolicy?.cap) body.cap = cap;
    }
    if (Object.keys(body).length === 0) return;

    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/tiers/${tier.productId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not save tier");
      }
      toast.success("Tier saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!editable) {
    return (
      <div className="flex items-center justify-between py-3">
        <span className="text-xs font-semibold">{tier.name}</span>
        <span className="text-[11px] text-ink-3">
          {formatNaira(tier.product.priceKobo)} · {sold} sold · editing closed
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-semibold outline-none transition-colors duration-150 focus:border-red"
        />
        <span className="text-[11px] text-ink-3 shrink-0">{sold} sold</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-3">₦</span>
          <input
            type="number"
            min={0}
            step="1"
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none transition-colors duration-150 focus:border-red"
          />
        </div>
        {hasCap && (
          <input
            type="number"
            min={sold}
            step="1"
            value={capValue}
            onChange={(e) => setCapValue(e.target.value)}
            className="w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none transition-colors duration-150 focus:border-red"
            aria-label="Cap"
          />
        )}
        <button
          onClick={handleSave}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      <p className="text-[11px] text-ink-3">Editing closes {EDIT_WINDOW_HOURS} hours after this tier went live.</p>
      {hasCap && <p className="text-[11px] text-ink-3">Cap can only be lowered, never below tickets already sold.</p>}
    </div>
  );
}

function EventEditor({ event, onSaved }: { event: CatalogEvent; onSaved: () => void }) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [venue, setVenue] = useState(event.venue ?? "");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function handleSave() {
    const body: { title?: string; description?: string; venue?: string } = {};
    if (title.trim() && title !== event.title) body.title = title.trim();
    if (description !== event.description) body.description = description;
    if (venue !== (event.venue ?? "")) body.venue = venue;
    if (Object.keys(body).length === 0) return;

    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${event.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not save");
      }
      toast.success("Event saved.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 pb-3 mb-1 border-b border-line-soft">
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
      <p className="text-[11px] text-ink-3">Editing closes {EDIT_WINDOW_HOURS} hours after publishing.</p>
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
                    {isWithinEditWindow(ev.publishedAt) ? (
                      <EventEditor event={ev} onSaved={load} />
                    ) : (
                      <p className="text-[11px] text-ink-3 pb-3 mb-1 border-b border-line-soft">
                        Editing this event&apos;s details closed {EDIT_WINDOW_HOURS} hours after it went live.
                      </p>
                    )}
                    <div className="flex flex-col divide-y divide-line-soft">
                      {ev.tiers.map((tier) => (
                        <TierEditor key={tier.productId} eventId={ev.id} tier={tier} onSaved={load} />
                      ))}
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
