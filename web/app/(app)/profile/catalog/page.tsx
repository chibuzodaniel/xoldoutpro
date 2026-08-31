"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { isWithinEditWindow, EDIT_WINDOW_HOURS } from "@/lib/editWindow";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { BackHeader } from "@/components/ui/BackHeader";

type CatalogProduct = {
  id: string;
  title: string;
  description: string;
  priceKobo: number;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  publishedAt: string | null;
  release: { artworkLadder: unknown } | null;
  stockPolicy: { cap: number | null; sold: number; soldOutAt: string | null } | null;
};

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Explicit ask: every owner can edit their upload, but only within a fixed
// window after it went live (lib/editWindow.ts) — never artwork/tracks,
// only what the server actually accepts (title/description/price/cap).
function ProductEditor({ product, onSaved }: { product: CatalogProduct; onSaved: () => void }) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description);
  const [priceNaira, setPriceNaira] = useState(String(product.priceKobo / 100));
  const [capValue, setCapValue] = useState(product.stockPolicy?.cap != null ? String(product.stockPolicy.cap) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCap = product.stockPolicy?.cap != null;
  const sold = product.stockPolicy?.sold ?? 0;

  async function handleSave() {
    setError(null);
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100);
    const body: { title?: string; description?: string; priceKobo?: number; cap?: number } = {};
    if (title.trim() && title !== product.title) body.title = title.trim();
    if (description !== product.description) body.description = description;
    if (!Number.isNaN(priceKobo) && priceKobo !== product.priceKobo) body.priceKobo = priceKobo;
    if (hasCap) {
      const cap = parseInt(capValue, 10);
      if (Number.isInteger(cap) && cap !== product.stockPolicy?.cap) body.cap = cap;
    }
    if (Object.keys(body).length === 0) return;

    setBusy(true);
    try {
      const res = await apiFetch(`/api/releases/${product.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not save");
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
          className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
      {hasCap && <p className="text-[11px] text-ink-3">Cap can only be lowered, never below units already sold.</p>}
      <p className="text-[11px] text-ink-3">Editing closes {EDIT_WINDOW_HOURS} hours after publishing.</p>
      {error && <p className="text-[11px] text-red-soft">{error}</p>}
    </div>
  );
}

export default function CatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch("/api/releases");
    if (res.ok) setProducts((await res.json()).products);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this release? It comes off sale and every discovery surface immediately. Anyone who already bought it keeps their copy forever — this is not a refund.")) {
      return;
    }
    const res = await apiFetch(`/api/releases/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else setError("Could not delete release");
  }

  return (
    <div className="pb-6">
      <BackHeader
        title="Catalog"
        action={
          <Link href="/publish/music" className="text-xs text-red-soft font-semibold shrink-0">
            + New release
          </Link>
        }
      />
      <div className="px-4">

      {error && <p className="text-sm text-red-soft mb-4">{error}</p>}

      {products === null ? (
        <LoadingSpinner full size="md" />
      ) : products.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing published yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {products.map((p) => {
            const artwork = (p.release?.artworkLadder as Record<string, string> | undefined)?.["64"];
            const isSoldOut = Boolean(p.stockPolicy?.soldOutAt);
            const cap = p.stockPolicy?.cap ?? null;
            const sold = p.stockPolicy?.sold ?? 0;
            const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
            const editable = p.status !== "DELETED" && isWithinEditWindow(p.publishedAt);
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} className="py-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-surface-2 shrink-0 overflow-hidden">
                    <FallbackImg src={artwork} alt={p.title} className="h-full w-full object-cover" fallback={null} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/r/${p.id}`} className="text-sm font-semibold line-clamp-1">
                      {p.title}
                    </Link>
                    <p className="text-xs text-ink-3">
                      {p.status === "DELETED" ? "Deleted · " : ""}
                      {formatNaira(p.priceKobo)} ·{" "}
                      {remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} left`) : `${sold} sold`}
                    </p>
                  </div>
                  {p.status !== "DELETED" && (
                    <div className="flex items-center gap-3 shrink-0">
                      {editable && (
                        <button
                          onClick={() => setEditingId(isEditing ? null : p.id)}
                          className="text-xs text-red-soft font-semibold"
                        >
                          {isEditing ? "Close" : "Edit"}
                        </button>
                      )}
                      <button onClick={() => handleDelete(p.id)} className="text-xs text-ink-3">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {isEditing && (
                  <div className="mt-2 ml-[52px] pl-3 border-l border-line-soft">
                    <ProductEditor product={p} onSaved={() => { setEditingId(null); load(); }} />
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
