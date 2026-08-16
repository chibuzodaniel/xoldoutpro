"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type CatalogProduct = {
  id: string;
  title: string;
  priceKobo: number;
  status: "DRAFT" | "PUBLISHED" | "DELETED";
  beat: { coverImageLadder: unknown } | null;
  stockPolicy: { cap: number | null; sold: number; soldOutAt: string | null } | null;
};

function formatNaira(kobo: number) {
  if (kobo === 0) return "Free";
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function BeatCatalogPage() {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await apiFetch("/api/beats");
    if (res.ok) setProducts((await res.json()).products);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this beat? It comes off sale and every discovery surface immediately. Anyone who already bought it keeps their copy forever — this is not a refund.")) {
      return;
    }
    const res = await apiFetch(`/api/beats/${id}`, { method: "DELETE" });
    if (res.ok) load();
    else setError("Could not delete beat");
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl">Beats</h1>
        <Link href="/publish/beat" className="text-xs text-red-soft font-semibold">
          + New beat
        </Link>
      </div>

      {error && <p className="text-sm text-red-soft mb-4">{error}</p>}

      {products === null ? (
        <LoadingSpinner full size="md" />
      ) : products.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing published yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {products.map((p) => {
            const cover = (p.beat?.coverImageLadder as Record<string, string> | undefined)?.["64"];
            const isSoldOut = Boolean(p.stockPolicy?.soldOutAt);
            const cap = p.stockPolicy?.cap ?? null;
            const sold = p.stockPolicy?.sold ?? 0;
            const remaining = cap !== null ? Math.max(cap - sold, 0) : null;
            return (
              <div key={p.id} className="flex items-center gap-3 py-3">
                <div className="h-10 w-10 rounded bg-surface-2 shrink-0 overflow-hidden">
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={p.title} className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link href={`/b/${p.id}`} className="text-sm font-semibold line-clamp-1">
                    {p.title}
                  </Link>
                  <p className="text-xs text-ink-3">
                    {p.status === "DELETED" ? "Deleted · " : ""}
                    {formatNaira(p.priceKobo)} ·{" "}
                    {remaining !== null ? (isSoldOut ? "Sold out" : `${remaining} left`) : `${sold} sold`}
                  </p>
                </div>
                {p.status !== "DELETED" && (
                  <button onClick={() => handleDelete(p.id)} className="text-xs text-ink-3 shrink-0">
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
