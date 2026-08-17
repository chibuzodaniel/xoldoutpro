"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Collection = { id: string; name: string; itemCount: number };

type Props = { entitlementId: string; open: boolean; onClose: () => void };

// Same bottom-sheet shell as PublishSheet/ReportSheet/InstallSheet — floats
// up from the "+" trigger on a Library item, doesn't cover the page.
export function AddToCollectionSheet({ entitlementId, open, onClose }: Props) {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [newName, setNewName] = useState("");
  const [addedTo, setAddedTo] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/collections")
      .then((res) => (res.ok ? res.json() : { collections: [] }))
      .then((data) => setCollections(data.collections));
  }, [open]);

  async function addTo(collectionId: string) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/collections/${collectionId}/items`, { method: "POST", body: JSON.stringify({ entitlementId }) });
      if (res.ok) setAddedTo((cur) => new Set(cur).add(collectionId));
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/collections", { method: "POST", body: JSON.stringify({ name }) });
      if (!res.ok) return;
      const data = await res.json();
      setCollections((cur) => [data.collection, ...(cur ?? [])]);
      setNewName("");
      await addTo(data.collection.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        open ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 h-7 w-7 rounded-full border border-line flex items-center justify-center text-ink-3"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        <h1 className="font-serif text-2xl mb-4">Add to collection</h1>

        {collections === null ? (
          <div className="h-24" />
        ) : (
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-4 max-h-52 overflow-y-auto">
            {collections.length === 0 && <p className="py-3 text-sm text-ink-3">No collections yet — create one below.</p>}
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => addTo(c.id)}
                disabled={busy || addedTo.has(c.id)}
                className="flex items-center justify-between py-3 text-left text-sm disabled:opacity-60"
              >
                <span>
                  {c.name} <span className="text-ink-3">· {c.itemCount}</span>
                </span>
                {addedTo.has(c.id) && <span className="text-red-soft text-xs font-semibold">Added</span>}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 60))}
            placeholder="New collection name"
            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2.5 text-sm outline-none focus:border-red"
          />
          <button
            type="button"
            onClick={createAndAdd}
            disabled={busy || !newName.trim()}
            className="rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
