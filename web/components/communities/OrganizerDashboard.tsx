"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { FallbackImg } from "@/components/ui/FallbackImg";

type MemberRow = {
  userId: string;
  role: string;
  plan: string | null;
  state: "active" | "expired" | "suspended";
  expiresAt: string | null;
  joinedAt: string;
  user: { handle: string; displayName: string; avatarUrl: string | null };
};
type Application = {
  id: string;
  status: string;
  plan: string | null;
  createdAt: string;
  user: { id: string; handle: string; displayName: string; avatarUrl: string | null };
};
type Dashboard = {
  isOwner: boolean;
  overview: {
    total: number;
    active: number;
    expired: number;
    suspended: number;
    pending: number;
    awaitingPayment: number;
    expiringSoon: number;
    byPlan: { id: string; name: string; active: number }[];
  };
  revenue: { grossKobo: number; commissionKobo: number; netKobo: number; last30GrossKobo: number } | null;
  members: MemberRow[];
  applications: Application[];
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}
function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

// Organizer dashboard (v2, design/v2-prototype): Overview and Members. Loads
// once when opened and after each action — never polled.
export function OrganizerDashboard({ communityId, view }: { communityId: string; view: "overview" | "members" }) {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/communities/${communityId}/dashboard`).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [communityId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load
    load();
  }, [load]);

  async function act(key: string, url: string, method: string, body: unknown, done: string) {
    setBusy(key);
    try {
      const res = await apiFetch(url, { method, body: body ? JSON.stringify(body) : undefined });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof d.error === "string" ? d.error : "Couldn't do that");
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't do that");
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="py-10 text-center text-sm text-ink-3">Loading…</p>;
  const o = data.overview;

  if (view === "overview") {
    const stat = (label: string, value: string | number, hint?: string) => (
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-[12px] text-ink-3">{label}</p>
        <p className="mt-1 font-serif text-[28px] font-bold leading-none">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-ink-3">{hint}</p>}
      </div>
    );
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stat("Total members", o.total)}
          {stat("Active", o.active)}
          {stat("Pending applications", o.pending, o.awaitingPayment ? `${o.awaitingPayment} approved, waiting to pay` : undefined)}
          {stat("Expiring in 7 days", o.expiringSoon)}
          {stat("Expired", o.expired)}
          {stat("Suspended", o.suspended)}
        </div>
        {data.revenue && (
          <div>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-ink-3">Revenue</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {stat("Gross", naira(data.revenue.grossKobo))}
              {stat("XOLDOUT commission", naira(data.revenue.commissionKobo))}
              {stat("Your earnings", naira(data.revenue.netKobo), "Already in your wallet")}
              {stat("Last 30 days", naira(data.revenue.last30GrossKobo))}
            </div>
          </div>
        )}
        {o.byPlan.length > 0 && (
          <div>
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-ink-3">Active members by plan</h3>
            <ul className="divide-y divide-line-soft rounded-2xl border border-line">
              {o.byPlan.map((p) => (
                <li key={p.id} className="flex justify-between px-4 py-3 text-sm">
                  <span>{p.name}</span>
                  <span className="font-bold">{p.active}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Link href="/wallet" className="self-start text-sm font-semibold text-red-soft">
          Open wallet →
        </Link>
      </div>
    );
  }

  const term = q.trim().toLowerCase();
  const members = data.members.filter((m) => !term || m.user.displayName.toLowerCase().includes(term) || m.user.handle.toLowerCase().includes(term));
  const btn = "rounded-full border border-line px-3 py-1.5 text-[12px] font-bold disabled:opacity-40";

  return (
    <div className="flex flex-col gap-5">
      {data.applications.length > 0 && (
        <div>
          <h3 className="mb-2 text-[12px] font-bold uppercase tracking-widest text-ink-3">Applications ({data.applications.length})</h3>
          <ul className="flex flex-col gap-2">
            {data.applications.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
                  <FallbackImg src={a.user.avatarUrl} alt="" className="h-full w-full object-cover" fallback={null} />
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block truncate font-bold">{a.user.displayName}</span>
                  <span className="block truncate text-ink-3">
                    {a.plan ?? "Join request"} · {a.status === "APPROVED" ? "approved, waiting to pay" : `applied ${day(a.createdAt)}`}
                  </span>
                </span>
                {a.status === "PENDING" && (
                  <span className="flex shrink-0 gap-1.5">
                    <button type="button" disabled={busy !== null} onClick={() => act(a.id, `/api/groups/${communityId}/join-requests/${a.id}`, "PATCH", { action: "approve" }, "Application approved")} className={`${btn} border-red bg-red text-white`}>
                      Approve
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => act(a.id, `/api/groups/${communityId}/join-requests/${a.id}`, "PATCH", { action: "reject" }, "Application rejected")} className={btn}>
                      Reject
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search members"
        aria-label="Search members"
        className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm outline-none focus:border-red"
      />
      <ul className="divide-y divide-line-soft">
        {members.map((m) => {
          const owner = m.role === "OWNER";
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <Link href={`/u/${m.user.handle}`} className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-surface-2">
                <FallbackImg src={m.user.avatarUrl} alt="" className="h-full w-full object-cover" fallback={null} />
              </Link>
              <span className="min-w-0 flex-1 text-sm">
                <span className="flex items-center gap-2">
                  <span className="truncate font-bold">{m.user.displayName}</span>
                  {m.role !== "MEMBER" && <span className="rounded-full bg-red px-2 py-0.5 text-[10px] font-extrabold text-white">{owner ? "OWNER" : "ADMIN"}</span>}
                </span>
                <span className="block truncate text-ink-3">
                  {m.plan ?? "Member"} · {m.state === "active" ? (m.expiresAt ? `until ${day(m.expiresAt)}` : "no expiry") : m.state}
                </span>
              </span>
              {!owner && (
                <span className="flex flex-wrap gap-1.5">
                  {m.state === "suspended" ? (
                    <button type="button" disabled={busy !== null} onClick={() => act(m.userId, `/api/communities/${communityId}/members/${m.userId}`, "PATCH", { action: "restore" }, "Membership restored")} className={btn}>
                      Restore
                    </button>
                  ) : (
                    <button type="button" disabled={busy !== null} onClick={() => act(m.userId, `/api/communities/${communityId}/members/${m.userId}`, "PATCH", { action: "suspend" }, "Membership suspended")} className={btn}>
                      Suspend
                    </button>
                  )}
                  {data.isOwner && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => act(m.userId, `/api/groups/${communityId}/members/${m.userId}`, "PATCH", { role: m.role === "ADMIN" ? "MEMBER" : "ADMIN" }, m.role === "ADMIN" ? "Admin removed" : "Made admin")}
                      className={btn}
                    >
                      {m.role === "ADMIN" ? "Remove admin" : "Make admin"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={async () => {
                      if (!(await toast.confirm(`Revoke ${m.user.displayName}'s membership? Paid time isn't refunded.`, { confirmLabel: "Revoke", destructive: true }))) return;
                      act(m.userId, `/api/groups/${communityId}/members/${m.userId}`, "DELETE", null, "Membership revoked");
                    }}
                    className={`${btn} text-red-soft`}
                  >
                    Revoke
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
