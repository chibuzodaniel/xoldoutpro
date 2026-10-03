"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

type DeletedEvent = {
  id: string;
  title: string;
  startsAt: string;
  deletedAt: string | null;
  creator: { handle: string; displayName: string };
  ticketsSold: number;
};

// Undo a mistaken event delete (lib/commerce/eventRestore.ts). Same spirit
// as RestoreAccountPanel above it: the delete was always soft, so tickets
// and check-in codes were never touched — this just puts the event (and the
// tiers deleted along with it) back, so the owner can hide tiers instead.
export function RestoreEventPanel() {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<DeletedEvent[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      const res = await apiFetch(`/api/admin/events/deleted?q=${encodeURIComponent(query)}`);
      if (cancelled || !res.ok) return;
      setEvents((await res.json()).events);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  async function restore(event: DeletedEvent) {
    setRestoringId(event.id);
    try {
      const res = await apiFetch(`/api/admin/events/${event.id}/restore`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not restore");
      toast.success(
        `"${event.title}" restored as ${data.status === "PUBLISHED" ? "published" : "a draft"} · ${data.tiersRestored} tier${data.tiersRestored === 1 ? "" : "s"} back`,
      );
      setEvents((list) => list?.filter((e) => e.id !== event.id) ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-1">Restore a deleted event</p>
      <p className="text-xs text-ink-3 mb-3">
        Tickets and check-in codes are never removed by a delete — restoring brings the event back so the owner can hide its tiers
        instead.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by event title or @handle"
        className="mb-3 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
      />
      {events === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-ink-3">No deleted events{query ? " match that search" : ""}.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft">
          {events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{e.title}</p>
                <p className="text-[11px] text-ink-3">
                  @{e.creator.handle} · {new Date(e.startsAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                  <span className={e.ticketsSold > 0 ? "font-semibold text-amber" : ""}>
                    {e.ticketsSold} ticket{e.ticketsSold === 1 ? "" : "s"} sold
                  </span>
                  {e.deletedAt && <> · deleted {new Date(e.deletedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => restore(e)}
                disabled={restoringId !== null}
                className="shrink-0 rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              >
                {restoringId === e.id ? "Restoring…" : "Restore"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
