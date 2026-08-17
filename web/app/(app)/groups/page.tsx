"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { GroupCard, type GroupCardData } from "@/components/groups/GroupCard";

export default function GroupsPage() {
  const router = useRouter();
  const [mine, setMine] = useState<GroupCardData[] | null>(null);
  const [discover, setDiscover] = useState<GroupCardData[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"OPEN" | "REQUEST_TO_JOIN">("REQUEST_TO_JOIN");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/groups")
      .then((res) => (res.ok ? res.json() : { groups: [] }))
      .then((data) => setMine(data.groups));
    apiFetch("/api/groups?discover=1")
      .then((res) => (res.ok ? res.json() : { groups: [] }))
      .then((data) => setDiscover(data.groups));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: trimmed, description: description.trim() || undefined, visibility }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not create group");
      router.push(`/groups/${data.group.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  if (mine === null || discover === null) return <LoadingSpinner full size="lg" />;

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="font-serif text-2xl">Groups</h1>
        <button type="button" onClick={() => setShowCreate((v) => !v)} className="text-xs font-semibold text-red-soft">
          {showCreate ? "Cancel" : "+ New group"}
        </button>
      </div>
      <p className="text-xs text-ink-3 mb-6">Closed communities around a creator — request to join, or open to everyone.</p>

      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-line-soft p-4 mb-6 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="Group name"
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            placeholder="What's this group for? (optional)"
            rows={2}
            className="rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red resize-none"
          />
          <div className="flex items-center gap-2">
            {(["REQUEST_TO_JOIN", "OPEN"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  visibility === v ? "border-red text-red-soft bg-red/10" : "border-line text-ink-2"
                }`}
              >
                {v === "OPEN" ? "Open to anyone" : "Request to join"}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-soft">{error}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 mt-1"
          >
            {creating ? "Creating…" : "Create group"}
          </button>
        </form>
      )}

      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-2">Your groups</h2>
      {mine.length === 0 ? (
        <p className="text-sm text-ink-3 mb-6">You haven&apos;t joined any groups yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {mine.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}

      <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-2">Discover</h2>
      {discover.filter((g) => !mine.some((m) => m.id === g.id)).length === 0 ? (
        <p className="text-sm text-ink-3">Nothing to discover yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {discover
            .filter((g) => !mine.some((m) => m.id === g.id))
            .map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
        </div>
      )}
    </div>
  );
}
