"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EntitlementCard, type EntitlementCardData } from "@/components/library/EntitlementCard";
import { useToast } from "@/components/ui/ToastProvider";

type Item = { entitlement: EntitlementCardData; addedAt: string };

export default function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    apiFetch(`/api/collections/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setName(data.collection.name);
        setItems(data.items);
      });
  }, [id]);

  async function saveName() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    const res = await apiFetch(`/api/collections/${id}`, { method: "PATCH", body: JSON.stringify({ name: trimmed }) });
    if (res.ok) {
      setName(trimmed);
      setEditing(false);
      toast.success("Collection renamed.");
    } else {
      toast.error("Could not rename collection");
    }
  }

  async function handleDeleteCollection() {
    if (!window.confirm("Delete this collection? What's inside stays in your Library — this only removes the grouping.")) return;
    const res = await apiFetch(`/api/collections/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Collection deleted.");
      router.push("/library");
    } else {
      toast.error("Could not delete collection");
    }
  }

  async function handleRemoveItem(entitlementId: string) {
    setRemoving(entitlementId);
    try {
      const res = await apiFetch(`/api/collections/${id}/items/${entitlementId}`, { method: "DELETE" });
      if (res.ok) setItems((cur) => cur?.filter((i) => i.entitlement.id !== entitlementId) ?? null);
      else toast.error("Could not remove item");
    } finally {
      setRemoving(null);
    }
  }

  if (name === null || items === null) return <LoadingSpinner full size="lg" />;

  return (
    <div className="px-4 py-6">
      <button type="button" onClick={() => router.back()} className="text-xl text-ink-2 mb-3" aria-label="Back">
        ‹
      </button>
      {editing ? (
        <div className="flex gap-2 mb-1">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value.slice(0, 60))}
            autoFocus
            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-xl font-serif outline-none focus:border-red"
          />
          <button type="button" onClick={saveName} className="rounded-lg bg-red px-3 text-xs font-semibold text-white">
            Save
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-serif text-2xl">{name}</h1>
          <button
            type="button"
            onClick={() => {
              setDraftName(name);
              setEditing(true);
            }}
            className="text-xs text-ink-3"
          >
            Rename
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-ink-3">
          {items.length} item{items.length === 1 ? "" : "s"}
        </p>
        <button type="button" onClick={handleDeleteCollection} className="text-xs text-red-soft">
          Delete collection
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing here yet — add items from the Purchased tab in Library.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {items.map((item) => (
            <div key={item.entitlement.id} className="relative">
              <EntitlementCard entitlement={item.entitlement} />
              <button
                type="button"
                onClick={() => handleRemoveItem(item.entitlement.id)}
                disabled={removing === item.entitlement.id}
                aria-label="Remove from collection"
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/70 text-white flex items-center justify-center disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
