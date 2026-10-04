"use client";

import { useEffect, useState } from "react";
import { useCanUse } from "./access";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

type ProductRow = {
  id: string;
  type: "RELEASE" | "BEAT" | "MERCH" | "EVENT";
  title: string;
  priceKobo: number;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  createdAt: string;
  publishedAt: string | null;
  creator: { handle: string; displayName: string };
  sold: number;
  cap: number | null;
  commissionPercent: number;
};

type ProductsPage = { products: ProductRow[]; page: number; totalPages: number; total: number };

const TYPE_LABEL: Record<ProductRow["type"], string> = { RELEASE: "Music", BEAT: "Beat", MERCH: "Merch", EVENT: "Event" };

function formatNaira(kobo: number) {
  return kobo === 0 ? "Free" : `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Explicit ask: moderators should be able to manage every product on the
// platform — browse/search, see owner/sales/ambassador detail, edit, and
// take down for any reason (DECISIONS.md). List follows UsersListPanel's
// exact search/debounce/pagination shape; selecting a row switches this
// panel into a detail view (ProductDetail below) rather than opening a
// modal, consistent with the rest of the rebuilt dashboard showing one
// thing at a time.
export function ProductsPanel() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProductsPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard debounced-fetch-on-input-change pattern
    setLoading(true);
    const handle = setTimeout(async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set("q", q.trim());
      if (type) params.set("type", type);
      if (status) params.set("status", status);
      const res = await apiFetch(`/api/admin/products?${params.toString()}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [q, type, status, page]);

  if (selectedId) {
    return <ProductDetail productId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by title or creator"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
      </div>
      <div className="flex gap-2 mb-3">
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
        >
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
        >
          <option value="">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="DELETED">Taken down</option>
        </select>
      </div>

      {loading && data === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : data === null || data.products.length === 0 ? (
        <p className="text-xs text-ink-3">No products found.</p>
      ) : (
        <>
          <p className="text-[11px] text-ink-3 mb-2">{data.total} product{data.total === 1 ? "" : "s"}</p>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {data.products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm truncate">
                    {p.title}{" "}
                    {p.status === "DELETED" && <span className="ml-1 text-[10px] uppercase tracking-widest text-red-soft">Taken down</span>}
                    {p.status === "DRAFT" && <span className="ml-1 text-[10px] uppercase tracking-widest text-ink-3">Draft</span>}
                  </p>
                  <p className="text-[11px] text-ink-3 truncate">
                    {TYPE_LABEL[p.type]} · {p.creator.displayName} (@{p.creator.handle}) · {formatNaira(p.priceKobo)} · {p.sold} sold
                    {p.cap != null ? ` / ${p.cap} cap` : ""} · {p.commissionPercent}%{" "}
                    {p.commissionPercent === 0 ? "(Limited)" : ""}
                  </p>
                </div>
                <span className="text-ink-3 shrink-0">›</span>
              </button>
            ))}
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-[11px] text-ink-3">
                Page {data.page} of {data.totalPages}
              </p>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={loading || page >= data.totalPages}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type AmbassadorCredit = { handle: string; displayName: string; amountKobo: number; role: "buyer-referral" | "seller-referral" };
type OrderRow = {
  orderId: string;
  buyerHandle: string;
  buyerDisplayName: string;
  quantity: number;
  amountKobo: number;
  status: string;
  createdAt: string;
  ambassadors: AmbassadorCredit[];
  promoter: { handle: string; displayName: string } | null;
};

type ProductDetailData = {
  product: {
    id: string;
    type: ProductRow["type"];
    title: string;
    description: string;
    priceKobo: number;
    status: ProductRow["status"];
    creator: { handle: string; displayName: string; email: string; isVerified: boolean; creatorPlan: string | null };
    merchItem: { shippingFeeKobo: number } | null;
    ticketTier: { name: string; event: { id: string; title: string } } | null;
  };
  soldCount: number;
  cap: number | null;
  orders: OrderRow[];
  commissionPercent: number;
};

function ProductDetail({ productId, onBack }: { productId: string; onBack: () => void }) {
  const canTakeDown = useCanUse()("productTakedown");
  const toast = useToast();
  const [data, setData] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceNaira, setPriceNaira] = useState("");
  const [capInput, setCapInput] = useState("");
  const [shippingFeeNaira, setShippingFeeNaira] = useState("");
  const [venue, setVenue] = useState("");
  const [saving, setSaving] = useState(false);
  const [takingDown, setTakingDown] = useState(false);

  async function load() {
    setLoading(true);
    const res = await apiFetch(`/api/admin/products/${productId}`);
    if (res.ok) {
      const detail: ProductDetailData = await res.json();
      setData(detail);
      setTitle(detail.product.title);
      setDescription(detail.product.description);
      setPriceNaira(String(detail.product.priceKobo / 100));
      setCapInput(detail.cap != null ? String(detail.cap) : "");
      setShippingFeeNaira(detail.product.merchItem ? String(detail.product.merchItem.shippingFeeKobo / 100) : "");
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { title, description };
      if (data.product.type === "EVENT") {
        body.venue = venue;
      } else {
        body.priceKobo = Math.round(Number(priceNaira) * 100);
        if (capInput.trim()) body.cap = Number(capInput);
        if (data.product.type === "MERCH") body.shippingFeeKobo = Math.round(Number(shippingFeeNaira) * 100);
      }
      const res = await apiFetch(`/api/admin/products/${productId}`, { method: "PATCH", body: JSON.stringify(body) });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(typeof errData.error === "string" ? errData.error : "Could not save changes");
      }
      toast.success("Product updated.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  async function handleTakedown() {
    const ok = await toast.confirm("Take down this product? It comes off sale and every discovery surface immediately, every buyer's entitlement is revoked, and the creator's earnings from it are reversed in the ledger. This cannot be undone.", { confirmLabel: "Take down", destructive: true });
    if (!ok) return;
    setTakingDown(true);
    try {
      const res = await apiFetch(`/api/admin/products/${productId}/takedown`, { method: "POST" });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof resData.error === "string" ? resData.error : "Could not take down product");
      if (resData.refundFailures?.length > 0) {
        toast.error(
          `Taken down, but ${resData.refundFailures.length} order${resData.refundFailures.length === 1 ? "" : "s"} couldn't be auto-refunded — check the wallet ledger and refund manually.`,
        );
      } else {
        toast.success("Taken down and every paid buyer refunded.");
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setTakingDown(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="text-xs font-semibold text-ink-3 mb-4">
        ‹ Back to products
      </button>

      {loading || !data ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-2">Owner</p>
            <p className="text-sm font-semibold">
              {data.product.creator.displayName} <span className="text-ink-3 font-normal">@{data.product.creator.handle}</span>
              {data.product.creator.isVerified && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Verified</span>}
            </p>
            <p className="text-xs text-ink-3">
              {data.product.creator.email} · Plan: {data.product.creator.creatorPlan ?? "Not chosen"}
            </p>
            <p className="text-xs text-ink-3 mt-1">
              Live commission: <span className="text-ink font-semibold">{data.commissionPercent}%</span>{" "}
              {data.commissionPercent === 0
                ? "— Limited plan, seller keeps 100%"
                : data.product.creator.creatorPlan === "BUYER_PAYS_FEE"
                  ? "— service charge, paid by the buyer on top of the price"
                  : "— deducted from the seller"}
            </p>
            <p className="text-xs text-ink-3 mt-2">
              {data.soldCount} sold{data.cap != null ? ` / ${data.cap} cap` : " (uncapped)"}
              {data.product.type === "EVENT" && data.product.ticketTier ? ` · Tier: ${data.product.ticketTier.name}` : ""}
            </p>
          </div>

          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Edit</p>
            {data.product.status === "DELETED" ? (
              <p className="text-xs text-ink-3">This product has been taken down and can no longer be edited.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-widest text-ink-3">{data.product.type === "EVENT" ? "Event title" : "Title"}</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] uppercase tracking-widest text-ink-3">Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                  />
                </label>
                {data.product.type === "EVENT" ? (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-widest text-ink-3">Venue</span>
                      <input value={venue} onChange={(e) => setVenue(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
                    </label>
                    <p className="text-[11px] text-ink-3">
                      Ticket tier name/price/cap are frozen once created — a buyer&apos;s receipt always matches what they saw. Remove and re-add a tier instead.
                    </p>
                  </>
                ) : (
                  <>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-widest text-ink-3">Price (₦)</span>
                      <input
                        type="number"
                        min={0}
                        value={priceNaira}
                        onChange={(e) => setPriceNaira(e.target.value)}
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-widest text-ink-3">Cap (blank = uncapped)</span>
                      <input
                        type="number"
                        min={0}
                        value={capInput}
                        onChange={(e) => setCapInput(e.target.value)}
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      />
                    </label>
                    {data.product.type === "MERCH" && (
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-widest text-ink-3">Shipping fee (₦)</span>
                        <input
                          type="number"
                          min={0}
                          value={shippingFeeNaira}
                          onChange={(e) => setShippingFeeNaira(e.target.value)}
                          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                        />
                      </label>
                    )}
                    <p className="text-[11px] text-ink-3">
                      Moderator edits aren&apos;t limited to the creator&apos;s 48h window and can raise the cap — it still can never drop below units already sold.
                    </p>
                  </>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="self-start rounded-lg bg-red px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 mt-1"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line-soft p-4 mb-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Orders ({data.orders.length})</p>
            {data.orders.length === 0 ? (
              <p className="text-xs text-ink-3">No orders yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-line-soft">
                {data.orders.map((o) => (
                  <div key={o.orderId} className="py-2.5">
                    <p className="text-sm">
                      {o.buyerDisplayName} <span className="text-ink-3">@{o.buyerHandle}</span> · {o.quantity}× ·{" "}
                      {formatNaira(o.amountKobo)} · {o.status}
                    </p>
                    <p className="text-[11px] text-ink-3">{new Date(o.createdAt).toLocaleString("en-NG")}</p>
                    {o.ambassadors.length > 0 &&
                      o.ambassadors.map((a, i) => (
                        <p key={i} className="text-[11px] text-red-soft">
                          Ambassador: @{a.handle} · {formatNaira(a.amountKobo)} · {a.role === "seller-referral" ? "referred the seller" : "referred the buyer"}
                        </p>
                      ))}
                    {o.promoter && <p className="text-[11px] text-red-soft">Ticket promoter: @{o.promoter.handle}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {data.product.status !== "DELETED" && canTakeDown && (
            <button
              type="button"
              onClick={handleTakedown}
              disabled={takingDown}
              className="w-full rounded-lg border border-red-soft px-4 py-3 text-sm font-semibold text-red-soft disabled:opacity-40"
            >
              {takingDown ? "Taking down…" : "Take down & refund everyone"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
