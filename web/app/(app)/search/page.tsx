"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { ProductCard, type ProductCardData } from "@/components/product/ProductCard";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Creator = { id: string; handle: string; displayName: string; avatarUrl: string | null };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(false);

  const queryTooShort = q.trim().length < 2;

  useEffect(() => {
    if (queryTooShort) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard debounced-fetch-on-input-change pattern
    setLoading(true);
    const handle = setTimeout(async () => {
      const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products);
        setCreators(data.creators);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [q, queryTooShort]);

  return (
    <div className="px-4 py-4">
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 mb-6">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-ink-3 shrink-0">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search releases, creators, handles"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
        />
      </div>

      {loading && <LoadingSpinner size="sm" />}

      {!queryTooShort && creators.length > 0 && (
        <div className="mb-7">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-3 mb-3">Creators</h3>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {creators.map((c) => (
              <Link key={c.id} href={`/u/${c.handle}`} className="flex items-center gap-3 py-2.5">
                <div className="h-9 w-9 rounded-full bg-surface-2 overflow-hidden flex items-center justify-center shrink-0">
                  <FallbackImg
                    src={c.avatarUrl}
                    alt={c.displayName}
                    className="h-full w-full object-cover"
                    fallback={<span className="font-serif text-sm text-ink-3">{c.displayName.slice(0, 1).toUpperCase()}</span>}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold">{c.displayName}</p>
                  <p className="text-xs text-ink-3">@{c.handle}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!queryTooShort && products.length > 0 && (
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-3 mb-3">Releases</h3>
          <div className="grid grid-cols-3 gap-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}

      {!loading && !queryTooShort && products.length === 0 && creators.length === 0 && (
        <p className="text-sm text-ink-3">Nothing found for &quot;{q}&quot;.</p>
      )}
    </div>
  );
}
