"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { listDownloads } from "@/lib/offline/downloads";

type Collection = { id: string; name: string; itemCount: number; covers: string[] };

type HeavyRotationProduct = {
  release?: { artworkLadder?: Record<string, string> } | null;
  beat?: { coverImageLadder?: Record<string, string> } | null;
};

// Card grid, not a list — a collection reads as a stack of covers, so it's
// shown as one, not a text row. Shared by real collections and the two
// automatic ones below (Downloaded, Heavy Rotation) — `href` swaps in for
// `id` so the automatic ones can point at their own literal-segment routes
// instead of /library/collections/[id].
function CollectionCard({ href, name, itemCount, covers }: { href: string; name: string; itemCount: number; covers: string[] }) {
  return (
    <Link href={href} className="block w-full">
      <div className="aspect-square w-full rounded-lg bg-surface-2 overflow-hidden grid grid-cols-2 gap-px">
        {covers.length > 0 ? (
          covers
            .slice(0, 4)
            .map((url, i) => (
              // A grid cell here needs to keep occupying its slot even if the
              // image fails, so it falls back to a plain surface fill rather
              // than nothing (unlike other FallbackImg call sites) — an
              // empty cell risks collapsing this 2x2 grid's row sizing.
              <FallbackImg
                key={i}
                src={url}
                alt=""
                className={`h-full w-full object-cover ${covers.length === 1 ? "col-span-2 row-span-2" : ""}`}
                fallback={<div className={`h-full w-full bg-surface-2 ${covers.length === 1 ? "col-span-2 row-span-2" : ""}`} />}
              />
            ))
        ) : (
          <div className="col-span-2 row-span-2" />
        )}
      </div>
      <p className="text-xs font-semibold mt-1.5 line-clamp-1">{name}</p>
      <p className="text-[12px] text-ink-3">{itemCount} item{itemCount === 1 ? "" : "s"}</p>
    </Link>
  );
}

type AutoCollections = { downloaded: { count: number; covers: string[] }; heavyRotation: { count: number; covers: string[] } };

export function CollectionsTab() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [auto, setAuto] = useState<AutoCollections | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch("/api/collections")
      .then((res) => (res.ok ? res.json() : { collections: [] }))
      .then((data) => setCollections(data.collections));

    async function loadHeavyRotationCovers(): Promise<{ artworkUrl: string | null }[]> {
      const res = await apiFetch("/api/library/heavy-rotation");
      if (!res.ok) return [];
      const data: { products: HeavyRotationProduct[] } = await res.json();
      return data.products.map((p) => ({
        artworkUrl: p.release?.artworkLadder?.["256"] ?? p.beat?.coverImageLadder?.["256"] ?? null,
      }));
    }

    Promise.all([listDownloads(), loadHeavyRotationCovers()]).then(([downloads, heavyRotation]) => {
      setAuto({
        downloaded: { count: downloads.length, covers: downloads.map((d) => d.artworkUrl).filter((u): u is string => !!u) },
        heavyRotation: { count: heavyRotation.length, covers: heavyRotation.map((p) => p.artworkUrl).filter((u): u is string => !!u) },
      });
    });
  }, []);

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/collections", { method: "POST", body: JSON.stringify({ name }) });
      if (res.ok) {
        const data = await res.json();
        setCollections((cur) => [data.collection, ...(cur ?? [])]);
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  }

  if (collections === null) return <LoadingSpinner full size="md" />;

  return (
    <div>
      <form onSubmit={createCollection} className="flex gap-2 mb-5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value.slice(0, 60))}
          placeholder="New collection name"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-red"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Create
        </button>
      </form>

      {(auto?.downloaded.count || auto?.heavyRotation.count) ? (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {auto.downloaded.count > 0 && (
            <CollectionCard
              href="/library/collections/downloaded"
              name="Downloaded"
              itemCount={auto.downloaded.count}
              covers={auto.downloaded.covers}
            />
          )}
          {auto.heavyRotation.count > 0 && (
            <CollectionCard
              href="/library/collections/heavy-rotation"
              name="Heavy Rotation"
              itemCount={auto.heavyRotation.count}
              covers={auto.heavyRotation.covers}
            />
          )}
        </div>
      ) : null}

      {collections.length === 0 ? (
        <p className="text-sm text-ink-3">
          Group what you own into collections — start by naming one above, then add items from Purchased.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {collections.map((c) => (
            <CollectionCard key={c.id} href={`/library/collections/${c.id}`} name={c.name} itemCount={c.itemCount} covers={c.covers} />
          ))}
        </div>
      )}
    </div>
  );
}
