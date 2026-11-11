"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { LINEUP_ROLE_LABEL } from "@/lib/event/lineupRules";

// Performance invitations (explicit ask, 2026-11-11): an event host tagged
// this artist; accepting shows them on the event and in their profile's Events.

type Invitation = {
  role: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  event: {
    id: string;
    title: string;
    startsAt: string;
    venue: string | null;
    isVirtual: boolean;
    coverImageLadder: Record<string, string> | null;
    creator: { handle: string; displayName: string };
  };
};

export default function InvitationsPage() {
  const { appUser } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Invitation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!appUser) return;
    apiFetch("/api/me/invitations")
      .then((r) => (r.ok ? r.json() : { invitations: [] }))
      .then((d) => setItems(d.invitations));
  }, [appUser]);

  async function answer(inv: Invitation, accept: boolean) {
    setBusy(inv.event.id);
    try {
      const res = await apiFetch(`/api/events/${inv.event.id}/lineup/respond`, { method: "POST", body: JSON.stringify({ accept }) });
      if (!res.ok) throw new Error();
      setItems((cur) => cur?.map((i) => (i.event.id === inv.event.id ? { ...i, status: accept ? "ACCEPTED" : "DECLINED" } : i)) ?? cur);
      toast.success(accept ? "You're on the lineup. It now shows on your profile." : "Invitation declined.");
    } catch {
      toast.error("Couldn't save your answer. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-24">
      <BackHeader title="Performance invitations" />
      <div className="mx-auto flex max-w-lg flex-col gap-3 px-4">
        {items === null ? (
          <LoadingSpinner full size="md" />
        ) : items.length === 0 ? (
          <p className="rounded-2xl border border-line-soft p-6 text-center text-sm text-ink-3">No invitations yet. When a host adds you to an event lineup, it shows up here.</p>
        ) : (
          items.map((inv) => {
            const cover = inv.event.coverImageLadder?.["256"] ?? inv.event.coverImageLadder?.["1024"] ?? null;
            return (
              <div key={inv.event.id} className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4">
                <Link href={`/e/${inv.event.id}`} className="flex gap-3.5">
                  <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    <FallbackImg src={cover} alt="" className="h-full w-full object-cover" fallback={null} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{inv.event.title}</span>
                    <span className="block text-[13px] text-ink-2">
                      {new Date(inv.event.startsAt).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                      {inv.event.isVirtual ? "Online" : (inv.event.venue ?? "Venue TBA")}
                    </span>
                    <span className="block text-[13px] text-ink-3">
                      {inv.event.creator.displayName} · as <b className="text-red-soft">{LINEUP_ROLE_LABEL[inv.role] ?? "Artist"}</b>
                    </span>
                  </span>
                </Link>
                {inv.status === "PENDING" ? (
                  <div className="mt-3 flex gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => answer(inv, true)} className="flex-1 rounded-full bg-red py-2.5 text-[14px] font-bold text-white disabled:opacity-50">
                      Accept
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => answer(inv, false)} className="flex-1 rounded-full border border-line py-2.5 text-[14px] font-semibold disabled:opacity-50">
                      Decline
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between text-[13px]">
                    <span className={inv.status === "ACCEPTED" ? "font-semibold text-green" : "text-ink-3"}>{inv.status === "ACCEPTED" ? "Accepted" : "Declined"}</span>
                    <button type="button" disabled={busy !== null} onClick={() => answer(inv, inv.status !== "ACCEPTED")} className="font-semibold text-red-soft disabled:opacity-50">
                      {inv.status === "ACCEPTED" ? "Withdraw" : "Accept instead"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
