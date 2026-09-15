"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ProductCard, type ProductCardData } from "@/components/product/ProductCard";

// Automatic collection, not a real Collection row — your own most-played
// owned tracks/beats (lib/library/heavyRotation.ts), same as the "Downloaded"
// pseudo-collection alongside it. Both are synthetic entries in
// CollectionsTab, this page and app/(app)/library/collections/downloaded's
// are the only two literal-segment siblings of the [id] route, which Next.js
// resolves in preference to the dynamic one for an exact match.
export default function HeavyRotationPage() {
  const router = useRouter();
  const [products, setProducts] = useState<ProductCardData[] | null>(null);

  useEffect(() => {
    apiFetch("/api/library/heavy-rotation")
      .then((res) => (res.ok ? res.json() : { products: [] }))
      .then((data) => setProducts(data.products));
  }, []);

  if (products === null) return <LoadingSpinner full size="lg" />;

  return (
    <div className="px-4 py-6">
      <button type="button" onClick={() => router.back()} className="text-xl text-ink-2 mb-3" aria-label="Back">
        ‹
      </button>
      <h1 className="font-serif text-2xl mb-1">Heavy Rotation</h1>
      <p className="text-xs text-ink-3 mb-6">
        {products.length} item{products.length === 1 ? "" : "s"} · your most-played, last 60 days
      </p>

      {products.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing here yet — play something you own and it'll show up.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
