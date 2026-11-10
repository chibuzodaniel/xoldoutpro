"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

type Row = {
  id: string;
  name: string;
  handle: string | null;
  category: string | null;
  isFeatured: boolean;
  suspendedAt: string | null;
  owner: { handle: string; displayName: string };
  memberCount: number;
  paidPlans: number;
  openReports: number;
};

// Moderator "Communities" panel (v2 part 3): feature/unfeature and
// suspend/restore communities, see open reports, run the renewal job.
export function CommunitiesModPanel() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    const res = await apiFetch(`/api/admin/communities${term ? `?q=${encodeURIComponent(term)}` : ""}`).catch(() => null);
    setRows(res?.ok ? (await res.json()).communities : []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  async function patch(r: Row, body: { featured?: boolean; suspended?: boolean }, done: string) {
    if (body.suspended && !(await toast.confirm(`Suspend ${r.name}? Joining, payments, posting and renewals stop.`, { confirmLabel: "Suspend", destructive: true }))) return;
    setBusy(r.id);
    const res = await apiFetch(`/api/admin/communities/${r.id}`, { method: "PATCH", body: JSON.stringify(body) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast.error("Couldn't update that community");
    toast.success(done);
    load(q.trim());
  }

  async function runRenewals() {
    setBusy("renewals");
    const res = await apiFetch("/api/admin/communities/renewals", { method: "POST" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return toast.error("Renewal job failed");
    const d = await res.json();
    const due = (d.memberships?.due ?? 0) + (d.subscriptions?.due ?? 0);
    toast.success(due ? `Renewal job ran: ${due} due` : "No renewals due right now");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Communities</h2>
          <p className="text-xs text-ink-3">Feature, suspend or restore communities. Reports about them are in the Reports queue.</p>
        </div>
        <button type="button" onClick={runRenewals} disabled={busy === "renewals"} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold disabled:opacity-40">
          {busy === "renewals" ? "Running…" : "Run renewal job now"}
        </button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or handle"
        className="mb-4 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-red"
      />
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-3">No communities found.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft rounded-xl border border-line">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/groups/${r.id}`} className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {r.name}
                  {r.isFeatured && <span className="rounded bg-red px-1.5 py-0.5 text-[10px] font-bold text-white">FEATURED</span>}
                  {r.suspendedAt && <span className="rounded border border-red-soft px-1.5 py-0.5 text-[10px] font-bold text-red-soft">SUSPENDED</span>}
                  {r.openReports > 0 && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-red-soft">
                      {r.openReports} open report{r.openReports === 1 ? "" : "s"}
                    </span>
                  )}
                </Link>
                <p className="text-xs text-ink-3">
                  @{r.owner.handle} · {r.memberCount} members · {r.paidPlans ? `${r.paidPlans} paid plan${r.paidPlans === 1 ? "" : "s"}` : "free"}
                  {r.category ? ` · ${r.category}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => patch(r, { featured: !r.isFeatured }, r.isFeatured ? "Unfeatured" : "Featured")}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                >
                  {r.isFeatured ? "Unfeature" : "Feature"}
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => patch(r, { suspended: !r.suspendedAt }, r.suspendedAt ? "Community restored" : "Community suspended")}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${r.suspendedAt ? "border border-line" : "bg-red text-white"}`}
                >
                  {r.suspendedAt ? "Restore" : "Suspend"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
