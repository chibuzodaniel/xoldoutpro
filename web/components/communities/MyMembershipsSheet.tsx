"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { isMembershipActive, planPriceLabel } from "@/lib/communities/constants";
import { MembershipCardSheet } from "@/components/communities/MembershipCardSheet";

type Plan = { id: string; name: string; priceKobo: number; cycle: string } | null;
type MembershipRow = { groupId: string; name: string; logoUrl: string | null; role: string; plan: Plan; expiresAt: string | null; autoRenew: boolean };
type ApplicationRow = { groupId: string; name: string; logoUrl: string | null; status: string; plan: Plan };

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// "My memberships" (v2, design/v2-prototype): active, applications, expired.
// Loaded each time the sheet opens.
export function MyMembershipsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [data, setData] = useState<{ memberships: MembershipRow[]; applications: ApplicationRow[]; now: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiFetch("/api/communities/memberships")
      .then((res) => (res.ok ? res.json() : { memberships: [], applications: [] }))
      .then((d) => !cancelled && setData({ memberships: d.memberships ?? [], applications: d.applications ?? [], now: Date.now() }))
      .catch(() => !cancelled && setData({ memberships: [], applications: [], now: Date.now() }));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const now = data?.now ?? 0;
  const active = data?.memberships.filter((m) => isMembershipActive(m, now)) ?? [];
  const expired = data?.memberships.filter((m) => !isMembershipActive(m, now)) ?? [];
  const soon = active.filter((m) => m.expiresAt && new Date(m.expiresAt).getTime() - now < 3 * 86400000);

  const Row = ({ id, name, logoUrl, sub, badge, badgeCls, action }: { id: string; name: string; logoUrl: string | null; sub: string; badge: string; badgeCls: string; action?: React.ReactNode }) => (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex items-center gap-3">
        <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-red/50 to-black">
          <FallbackImg src={logoUrl} alt={name} className="h-full w-full object-cover" fallback={null} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{name}</span>
          <span className="block truncate text-[12px] text-ink-3">{sub}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${badgeCls}`}>{badge}</span>
      </div>
      <div className="mt-3 flex gap-2">
        {action}
        <Link href={`/groups/${id}`} onClick={onClose} className="rounded-full border border-line px-4 py-2.5 text-[13px] font-bold">
          Open community
        </Link>
      </div>
    </div>
  );

  return (
    <BottomSheet open={open} onClose={onClose} title="My memberships">
      <div className="flex flex-col gap-3 px-5 pb-4">
        {data === null ? (
          <p className="py-6 text-center text-sm text-ink-3">Loading…</p>
        ) : data.memberships.length === 0 && data.applications.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">You haven&apos;t joined any communities yet.</p>
        ) : (
          <>
            {soon.map((m) => (
              <p key={`soon-${m.groupId}`} className="rounded-2xl border border-red/40 bg-red-tint px-4 py-3 text-[14px]">
                {m.name} {m.autoRenew ? "renews" : "ends"} on {day(m.expiresAt!)}
                {m.plan && m.plan.priceKobo > 0 ? ` (${planPriceLabel(m.plan)})` : ""}.
              </p>
            ))}
            {active.length > 0 && <h3 className="text-[13px] text-ink-3">Active ({active.length})</h3>}
            {active.map((m) => (
              <Row
                key={m.groupId}
                id={m.groupId}
                name={m.name}
                logoUrl={m.logoUrl}
                sub={`${m.role === "OWNER" ? "Owner" : (m.plan?.name ?? "Member")} · ${m.expiresAt ? `${m.autoRenew ? "Renews" : "Ends"} ${day(m.expiresAt)}` : "No expiry"}`}
                badge={m.role === "OWNER" ? "OWNER" : "ACTIVE"}
                badgeCls="bg-red text-white"
                action={
                  <button type="button" onClick={() => setCardFor(m.groupId)} className="rounded-full bg-red px-4 py-2.5 text-[13px] font-bold text-white">
                    Card
                  </button>
                }
              />
            ))}
            {data.applications.length > 0 && <h3 className="text-[13px] text-ink-3">Applications ({data.applications.length})</h3>}
            {data.applications.map((a) => (
              <Row
                key={`app-${a.groupId}`}
                id={a.groupId}
                name={a.name}
                logoUrl={a.logoUrl}
                sub={`${a.plan?.name ?? "Membership"} · ${a.status === "APPROVED" ? "Approved — pay to join" : "Awaiting approval"}`}
                badge={a.status === "APPROVED" ? "APPROVED" : "PENDING"}
                badgeCls={a.status === "APPROVED" ? "bg-white text-black" : "bg-surface-2 text-ink-2 border border-line"}
                action={
                  a.status === "APPROVED" && a.plan ? (
                    <Link href={`/groups/${a.groupId}?join=${a.plan.id}`} onClick={onClose} className="rounded-full bg-red px-4 py-2.5 text-[13px] font-bold text-white">
                      Pay to join
                    </Link>
                  ) : undefined
                }
              />
            ))}
            {expired.length > 0 && <h3 className="text-[13px] text-ink-3">Expired ({expired.length})</h3>}
            {expired.map((m) => (
              <Row
                key={`exp-${m.groupId}`}
                id={m.groupId}
                name={m.name}
                logoUrl={m.logoUrl}
                sub={`${m.plan?.name ?? "Member"} · Expired ${day(m.expiresAt!)}`}
                badge="EXPIRED"
                badgeCls="bg-surface-2 text-ink-2 border border-line"
                action={
                  <Link href={`/groups/${m.groupId}?renew=1`} onClick={onClose} className="rounded-full bg-red px-4 py-2.5 text-[13px] font-bold text-white">
                    Renew
                  </Link>
                }
              />
            ))}
          </>
        )}
      </div>
      {cardFor && <MembershipCardSheet open onClose={() => setCardFor(null)} communityId={cardFor} />}
    </BottomSheet>
  );
}
