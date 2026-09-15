"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { ShareButton } from "@/components/ui/ShareButton";
import { UserHandleAutocomplete } from "@/components/ui/UserHandleAutocomplete";

type Promoter = {
  id: string;
  sharePercent: number;
  code: string;
  referredCount: number;
  user: { handle: string; displayName: string };
};

// Owner-only, same reasoning/pattern as PublishedByYou.tsx: event pages are
// cached Server Components, so this reads the client-side session and
// renders nothing for anyone but the event's own creator.
export function EventPromotersPanel({ eventId, eventTitle, creatorId }: { eventId: string; eventTitle: string; creatorId: string }) {
  const { appUser } = useAuth();
  const toast = useToast();
  const [promoters, setPromoters] = useState<Promoter[] | null>(null);
  const [handle, setHandle] = useState("");
  const [sharePercent, setSharePercent] = useState("10");
  const [busy, setBusy] = useState(false);

  const isOwner = appUser?.id === creatorId;

  async function load() {
    const res = await apiFetch(`/api/events/${eventId}/promoters`);
    if (!res.ok) return;
    const data: { promoters: Promoter[] } = await res.json();
    setPromoters(data.promoters);
  }

  useEffect(() => {
    if (!isOwner) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, eventId]);

  async function handleAdd() {
    const trimmed = handle.trim().replace(/^@/, "");
    const percent = Number(sharePercent);
    if (!trimmed || !Number.isInteger(percent) || percent < 1 || percent > 90) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/promoters`, {
        method: "POST",
        body: JSON.stringify({ handle: trimmed, sharePercent: percent }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not add promoter");
      toast.success(`@${trimmed} added as a promoter.`);
      setHandle("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(promoterId: string) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/events/${eventId}/promoters/${promoterId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove promoter");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!isOwner) return null;

  return (
    <div className="mt-6 rounded-lg border border-line p-4">
      <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Ticket promoters</h2>
      <p className="text-xs text-ink-3 mb-3">
        Add anyone to earn a % of your own ticket revenue when they bring in a sale through their own link.
      </p>

      {promoters && promoters.length > 0 && (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-3">
          {promoters.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">
                  {p.user.displayName} <span className="text-ink-3 font-normal">@{p.user.handle}</span>
                </p>
                <p className="text-xs text-ink-3">
                  {p.sharePercent}% of your net per ticket · {p.referredCount} referred
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ShareButton
                  title={eventTitle}
                  text={`Get tickets to ${eventTitle} on XOLDOUT`}
                  path={`/e/${eventId}?promo=${p.code}`}
                  label="Copy link"
                  className="border border-line text-ink-2"
                />
                <button
                  onClick={() => handleRemove(p.id)}
                  disabled={busy}
                  className="text-xs text-red-soft font-semibold disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <UserHandleAutocomplete
          value={handle}
          onChange={setHandle}
          onSelect={(u) => setHandle(u.handle)}
          excludeUserId={appUser?.id}
          className="flex-1 min-w-0 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
        />
        <input
          value={sharePercent}
          onChange={(e) => setSharePercent(e.target.value)}
          type="number"
          min={1}
          max={90}
          className="w-16 rounded-lg border border-line bg-surface px-2 py-2 text-sm text-center"
        />
        <button
          onClick={handleAdd}
          disabled={busy}
          className="shrink-0 rounded-lg bg-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
