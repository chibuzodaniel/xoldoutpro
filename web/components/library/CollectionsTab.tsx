"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type Collection = { id: string; name: string; itemCount: number; covers: string[] };

// Card grid, not a list — a collection reads as a stack of covers, so it's
// shown as one, not a text row.
function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link href={`/library/collections/${collection.id}`} className="block w-full">
      <div className="aspect-square w-full rounded-lg bg-surface-2 overflow-hidden grid grid-cols-2 gap-px">
        {collection.covers.length > 0 ? (
          collection.covers
            .slice(0, 4)
            .map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt="" className={`h-full w-full object-cover ${collection.covers.length === 1 ? "col-span-2 row-span-2" : ""}`} />
            ))
        ) : (
          <div className="col-span-2 row-span-2" />
        )}
      </div>
      <p className="text-xs font-semibold mt-1.5 line-clamp-1">{collection.name}</p>
      <p className="text-[11px] text-ink-3">{collection.itemCount} item{collection.itemCount === 1 ? "" : "s"}</p>
    </Link>
  );
}

export function CollectionsTab() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch("/api/collections")
      .then((res) => (res.ok ? res.json() : { collections: [] }))
      .then((data) => setCollections(data.collections));
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

      {collections.length === 0 ? (
        <p className="text-sm text-ink-3">
          Group what you own into collections — start by naming one above, then add items from Purchased.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {collections.map((c) => (
            <CollectionCard key={c.id} collection={c} />
          ))}
        </div>
      )}
    </div>
  );
}
