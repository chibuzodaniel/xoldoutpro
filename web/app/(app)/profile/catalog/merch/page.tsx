"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { isWithinEditWindow, EDIT_WINDOW_HOURS } from "@/lib/editWindow";

type CatalogProduct = {
  id: string;
  title: string;
  description: string;
  priceKobo: number;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  publishedAt: string | null;
  merchItem: { imageLadder: unknown; shippingFeeKobo: number } | null;
  stockPolicy: { cap: number | null; sold: number; soldOutAt: string | null } | null;
};

type FulfillmentOrder = {
  id: string;
  buyer: { displayName: string; handle: string };
  items: { product: { id: string; title: string } }[];
  merchFulfillment: {
    status: "TO_SHIP" | "SHIPPED" | "DELIVERED";
    recipientName: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    shippingFeeKobo: number;
    trackingInfo: string | null;
  } | null;
};

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function ProductEditor({ product, onSaved }: { product: CatalogProduct; onSaved: () => void }) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description);
  const [priceNaira, setPriceNaira] = useState(String(product.priceKobo / 100));
  const [shippingFeeNaira, setShippingFeeNaira] = useState(String((product.merchItem?.shippingFeeKobo ?? 0) / 100));
  const [capValue, setCapValue] = useState(product.stockPolicy?.cap != null ? String(product.stockPolicy.cap) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCap = product.stockPolicy?.cap != null;
  const sold = product.stockPolicy?.sold ?? 0;

  async function handleSave() {
    setError(null);
    const priceKobo = Math.round(parseFloat(priceNaira || "0") * 100);
    const shippingFeeKobo = Math.round(parseFloat(shippingFeeNaira || "0") * 100);
    const body: { title?: string; description?: string; priceKobo?: number; shippingFeeKobo?: number; cap?: number } = {};
    if (title.trim() && title !== product.title) body.title = title.trim();
    if (description !== product.description) body.description = description;
    if (!Number.isNaN(priceKobo) && priceKobo !== product.priceKobo) body.priceKobo = priceKobo;
    if (!Number.isNaN(shippingFeeKobo) && shippingFeeKobo !== (product.merchItem?.shippingFeeKobo ?? 0)) {
      body.shippingFeeKobo = shippingFeeKobo;
    }
    if (hasCap) {
      const cap = parseInt(capValue, 10);
      if (Number.isInteger(cap) && cap !== product.stockPolicy?.cap) body.cap = cap;
    }
    if (Object.keys(body).length === 0) return;

    setBusy(true);
    try {
      const res = await apiFetch(`/api/merch/${product.id}`, { method: "PATCH", body: JSON.stringify(body) });
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
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-3">₦</span>
          <input
            type="number"
            min={0}
            step="1"
            value={priceNaira}
            onChange={(e) => setPriceNaira(e.target.value)}
            className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none transition-colors duration-150 focus:border-red"
            aria-label="Price"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-3">Ship ₦</span>
          <input
            type="number"
            min={0}
            step="1"
            value={shippingFeeNaira}
            onChange={(e) => setShippingFeeNaira(e.target.value)}
            className="w-24 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none transition-colors duration-150 focus:border-red"
            aria-label="Shipping fee"
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

export default function MerchCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [orders, setOrders] = useState<FulfillmentOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trackingDrafts, setTrackingDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  async function loadProducts() {
    const res = await apiFetch("/api/merch");
    if (res.ok) setProducts((await res.json()).products);
  }

  async function loadOrders() {
    const res = await apiFetch("/api/merch/fulfillments");
    if (res.ok) setOrders((await res.json()).orders);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    loadProducts();
    loadOrders();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this listing? It comes off sale and every discovery surface immediately. Anyone who already bought it keeps their order — this is not a refund.")) {
      return;
    }
    const res = await apiFetch(`/api/merch/${id}`, { method: "DELETE" });
    if (res.ok) loadProducts();
    else setError("Could not delete listing");
  }

  async function handleMarkShipped(orderId: string) {
    const res = await apiFetch(`/api/merch/fulfillments/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "SHIPPED", trackingInfo: trackingDrafts[orderId] || undefined }),
    });
    if (res.ok) loadOrders();
    else setError("Could not update order");
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Merchandise</h1>
        <Link href="/publish/merch" className="text-xs text-red-soft font-semibold">
          + New listing
        </Link>
      </div>

      {error && <p className="text-sm text-red-soft mb-4">{error}</p>}

      {products === null ? (
        <LoadingSpinner full size="md" />
      ) : products.length === 0 ? (
        <p className="text-sm text-ink-3 mb-8">Nothing published yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-8">
          {products.map((p) => {
            const image = (p.merchItem?.imageLadder as Record<string, string> | undefined)?.["64"];
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
                    {image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={p.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link href={`/m/${p.id}`} className="text-sm font-semibold line-clamp-1">
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
                    <ProductEditor product={p} onSaved={() => { setEditingId(null); loadProducts(); }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Orders to fulfil</h2>
      {orders === null ? (
        <LoadingSpinner full size="sm" />
      ) : orders.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing to ship yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <div key={o.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">{o.items.map((i) => i.product.title).join(", ")}</p>
                <span className="text-[11px] uppercase tracking-widest text-red-soft font-semibold">
                  {o.merchFulfillment?.status.replace("_", " ")}
                </span>
              </div>
              <p className="text-xs text-ink-3 mb-1">{o.buyer.displayName} (@{o.buyer.handle})</p>
              {o.merchFulfillment && (
                <p className="text-xs text-ink-3 mb-1">
                  {o.merchFulfillment.recipientName} · {o.merchFulfillment.addressLine1}
                  {o.merchFulfillment.addressLine2 ? `, ${o.merchFulfillment.addressLine2}` : ""}, {o.merchFulfillment.city},{" "}
                  {o.merchFulfillment.state}
                </p>
              )}
              {Boolean(o.merchFulfillment?.shippingFeeKobo) && (
                <p className="text-xs text-ink-3 mb-3">
                  Shipping fee collected: {formatNaira(o.merchFulfillment!.shippingFeeKobo)}
                </p>
              )}
              {o.merchFulfillment?.status === "TO_SHIP" && (
                <div className="flex gap-2">
                  <input
                    value={trackingDrafts[o.id] ?? ""}
                    onChange={(e) => setTrackingDrafts((cur) => ({ ...cur, [o.id]: e.target.value }))}
                    placeholder="Tracking info (optional)"
                    className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs outline-none transition-colors duration-150 focus:border-red"
                  />
                  <button
                    onClick={() => handleMarkShipped(o.id)}
                    className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white shrink-0"
                  >
                    Mark shipped
                  </button>
                </div>
              )}
              {o.merchFulfillment?.trackingInfo && (
                <p className="text-xs text-ink-3 mt-2">Tracking: {o.merchFulfillment.trackingInfo}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
