"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type ModEventPromoter = {
  id: string;
  sharePercent: number;
  referredCount: number;
  createdAt: string;
  user: { handle: string; displayName: string };
  event: { id: string; title: string; creator: { handle: string; displayName: string } };
};

// Platform-wide view of every event's ticket promoters — the owner's own
// EventPromotersPanel is scoped to their own events only, this is
// moderation's equivalent for cases an owner won't/can't act on themselves.
export function EventPromotersModPanel() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [promoters, setPromoters] = useState<ModEventPromoter[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    const res = await apiFetch(`/api/admin/event-promoters${query.trim().length >= 2 ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
    if (res.ok) setPromoters((await res.json()).promoters);
  }, []);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state */
    load("");
  }, [load]);

  async function handleRemove(promoter: ModEventPromoter) {
    if (!window.confirm(`Remove @${promoter.user.handle} as a promoter of "${promoter.event.title}"?`)) return;
    setBusyId(promoter.id);
    try {
      const res = await apiFetch(`/api/admin/event-promoters/${promoter.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove promoter");
      setPromoters((cur) => cur?.filter((p) => p.id !== promoter.id) ?? null);
      toast.success(`Removed @${promoter.user.handle} from "${promoter.event.title}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Ticket promoters</p>
      <div className="flex gap-2 mb-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(q)}
          placeholder="Search by promoter, event, or owner"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
        <button
          type="button"
          onClick={() => load(q)}
          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold"
        >
          Search
        </button>
      </div>

      {promoters === null ? (
        <LoadingSpinner size="md" />
      ) : promoters.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing found.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {promoters.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {p.user.displayName} <span className="text-ink-3 font-normal">@{p.user.handle}</span>
                </p>
                <Link href={`/e/${p.event.id}`} className="text-xs text-ink-3 hover:underline truncate block">
                  {p.event.title} · by @{p.event.creator.handle}
                </Link>
                <p className="text-[11px] text-ink-3 mt-0.5">
                  {p.sharePercent}% share · {p.referredCount} referred
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(p)}
                disabled={busyId === p.id}
                className="shrink-0 text-xs font-semibold text-red-soft disabled:opacity-50"
              >
                {busyId === p.id ? "…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

