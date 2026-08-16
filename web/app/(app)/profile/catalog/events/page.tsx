"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type CatalogTier = {
  productId: string;
  name: string;
  product: { priceKobo: number; stockPolicy: { cap: number | null; sold: number; soldOutAt: string | null } | null };
};

type CatalogEvent = {
  id: string;
  title: string;
  startsAt: string;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
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
  const [priceNaira, setPriceNaira] = useState(String(tier.product.priceKobo / 100));
  const [capValue, setCapValue] = useState(tier.product.stockPolicy?.cap != null ? String(tier.product.stockPolicy.cap) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCap = tier.product.stockPolicy?.cap != null;
  const sold = tier.product.stockPolicy?.sold ?? 0;

  async function handleSave() {
    setError(null);
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100);
    const body: { priceKobo?: number; cap?: number } = {};
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
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">{tier.name}</span>
        <span className="text-[10px] text-ink-3">{sold} sold</span>
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
      {hasCap && <p className="text-[10px] text-ink-3">Cap can only be lowered, never below tickets already sold.</p>}
      {error && <p className="text-[10px] text-red-soft">{error}</p>}
    </div>
  );
}

export default function EventCatalogPage() {
  const [events, setEvents] = useState<CatalogEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (res.ok) load();
    else setError("Could not delete event");
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Events</h1>
        <Link href="/publish/event" className="text-xs text-red-soft font-semibold">
          + New event
        </Link>
      </div>

      {error && <p className="text-sm text-red-soft mb-4">{error}</p>}

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
                    {cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt={ev.title} className="h-full w-full object-cover" />
                    )}
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
                  <div className="mt-2 ml-[52px] pl-3 border-l border-line-soft flex flex-col divide-y divide-line-soft">
                    {ev.tiers.map((tier) => (
                      <TierEditor key={tier.productId} eventId={ev.id} tier={tier} onSaved={load} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
