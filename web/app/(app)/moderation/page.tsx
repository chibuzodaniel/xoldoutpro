"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type ReportRow = {
  id: string;
  targetType: "PRODUCT" | "EVENT" | "POST" | "PROFILE";
  reason: "INAPPROPRIATE_CONTENT" | "COPYRIGHT_CLAIM" | "BUG" | "FEATURE_REQUEST";
  status: "OPEN" | "IN_REVIEW" | "RESOLVED";
  details: string | null;
  slaDueAt: string | null;
  createdAt: string;
  reporter: { handle: string; displayName: string };
  product: { id: string; title: string; type: string; creator: { handle: string; displayName: string } } | null;
  event: { id: string; title: string; creator: { handle: string; displayName: string } } | null;
  post: { id: string; body: string; author: { handle: string; displayName: string } } | null;
  profile: { id: string; handle: string; displayName: string } | null;
};

const REASON_LABEL: Record<ReportRow["reason"], string> = {
  INAPPROPRIATE_CONTENT: "Inappropriate content",
  COPYRIGHT_CLAIM: "Copyright claim",
  BUG: "Bug report",
  FEATURE_REQUEST: "Feature request",
};

const PRODUCT_HREF: Record<string, string> = { RELEASE: "/r", BEAT: "/b", MERCH: "/m" };

function targetSummary(r: ReportRow) {
  if (r.reason === "BUG" || r.reason === "FEATURE_REQUEST") {
    return { label: "App feedback", href: null };
  }
  if (r.product) {
    const href = PRODUCT_HREF[r.product.type] ? `${PRODUCT_HREF[r.product.type]}/${r.product.id}` : null;
    return { label: `${r.product.type} · "${r.product.title}" by ${r.product.creator.displayName}`, href };
  }
  if (r.event) {
    return { label: `Event · "${r.event.title}" by ${r.event.creator.displayName}`, href: `/e/${r.event.id}` };
  }
  if (r.post) {
    return { label: `Post by ${r.post.author.displayName}: "${r.post.body.slice(0, 60)}"`, href: null };
  }
  if (r.profile) {
    return { label: `Profile · @${r.profile.handle}`, href: `/u/${r.profile.handle}` };
  }
  return { label: "Unknown target", href: null };
}

function slaLabel(slaDueAt: string | null) {
  if (!slaDueAt) return null;
  const ms = new Date(slaDueAt).getTime() - Date.now();
  const hours = Math.round(Math.abs(ms) / (60 * 60 * 1000));
  return ms < 0 ? { text: `Overdue by ${hours}h`, overdue: true } : { text: `Due in ${hours}h`, overdue: false };
}

export default function ModerationPage() {
  const { appUser, loading } = useAuth();
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/reports");
    if (!res.ok) {
      setReports([]);
      return;
    }
    const data: { reports: ReportRow[] } = await res.json();
    setReports(data.reports);
  }, []);

  useEffect(() => {
    if (!appUser?.isModerator) return;
    async function initialLoad() {
      const res = await apiFetch("/api/reports");
      if (!res.ok) {
        setReports([]);
        return;
      }
      const data: { reports: ReportRow[] } = await res.json();
      setReports(data.reports);
    }
    initialLoad();
  }, [appUser]);

  async function act(id: string, action: "review" | "dismiss" | "takedown") {
    if (action === "takedown") {
      const ok = window.confirm(
        "Take down this listing? It comes off sale and every discovery surface immediately, every buyer's entitlement is revoked, and the creator's earnings from it are reversed in the ledger. This cannot be undone.",
      );
      if (!ok) return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/reports/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not update report");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingSpinner full size="lg" />;
  if (!appUser?.isModerator) {
    return (
      <div className="px-4 py-6">
        <h1 className="font-serif text-2xl mb-2">Moderation</h1>
        <p className="text-sm text-ink-3">You don&apos;t have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-1">Moderation queue</h1>
      <p className="text-xs text-ink-3 mb-6">Open and in-review reports, soonest SLA first.</p>

      <VerifyCreatorPanel />
      <VerifyGroupPanel />

      {error && <p className="text-sm text-red-soft mb-4">{error}</p>}

      {reports === null ? (
        <LoadingSpinner full size="md" />
      ) : reports.length === 0 ? (
        <p className="text-sm text-ink-3">Nothing in the queue.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {reports.map((r) => {
            const target = targetSummary(r);
            const sla = slaLabel(r.slaDueAt);
            const canTakedown = r.status === "IN_REVIEW" && r.reason === "COPYRIGHT_CLAIM" && r.targetType === "PRODUCT";
            return (
              <div key={r.id} className="rounded-lg border border-line-soft p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="rounded-full bg-red/10 text-red-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
                    {REASON_LABEL[r.reason]}
                  </span>
                  {sla && (
                    <span className={`text-[11px] font-semibold ${sla.overdue ? "text-red-soft" : "text-ink-3"}`}>{sla.text}</span>
                  )}
                </div>
                {target.href ? (
                  <Link href={target.href} className="text-sm font-semibold mb-1 block">
                    {target.label}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold mb-1">{target.label}</p>
                )}
                {r.details && <p className="text-sm text-ink-2 mb-2">{r.details}</p>}
                <p className="text-[11px] text-ink-3 mb-3">
                  Reported by {r.reporter.displayName} · {new Date(r.createdAt).toLocaleString("en-NG")} · {r.status}
                </p>
                <div className="flex items-center gap-2">
                  {r.status === "OPEN" && (
                    <button
                      type="button"
                      onClick={() => act(r.id, "review")}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    >
                      Start review
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => act(r.id, "dismiss")}
                    disabled={busyId === r.id}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                  >
                    Dismiss
                  </button>
                  {canTakedown && (
                    <button
                      type="button"
                      onClick={() => act(r.id, "takedown")}
                      disabled={busyId === r.id}
                      className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Take down & refund
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// PRD §18: verification criteria are undecided — this is deliberately a
// blunt handle-lookup toggle, not a review workflow with evidence/criteria.
function VerifyCreatorPanel() {
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<{ handle: string; isVerified: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(verified: boolean) {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/verify", { method: "POST", body: JSON.stringify({ handle: trimmed, verified }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Verify a creator</p>
      <div className="flex gap-2 mb-2">
        <input
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            setResult(null);
          }}
          placeholder="handle"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
        <button
          type="button"
          onClick={() => toggle(true)}
          disabled={busy || !handle.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => toggle(false)}
          disabled={busy || !handle.trim()}
          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 disabled:opacity-40"
        >
          Unverify
        </button>
      </div>
      {error && <p className="text-xs text-red-soft">{error}</p>}
      {result && (
        <p className="text-xs text-ink-3">
          @{result.handle} is now {result.isVerified ? "verified" : "not verified"}.
        </p>
      )}
    </div>
  );
}

type PendingGroup = {
  id: string;
  name: string;
  verificationRequestedAt: string;
  creator: { handle: string; displayName: string };
};

// Mirrors VerifyCreatorPanel above, plus a queue of groups that actually
// applied — a moderator otherwise has no way to know which names to look up.
function VerifyGroupPanel() {
  const [pending, setPending] = useState<PendingGroup[] | null>(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ name: string; isVerified: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/verify-group");
    if (!res.ok) {
      setPending([]);
      return;
    }
    const data: { pending: PendingGroup[] } = await res.json();
    setPending(data.pending);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      const res = await apiFetch("/api/admin/verify-group");
      if (!res.ok) {
        setPending([]);
        return;
      }
      const data: { pending: PendingGroup[] } = await res.json();
      setPending(data.pending);
    }
    initialLoad();
  }, []);

  async function toggle(groupName: string, verified: boolean) {
    setBusy(groupName);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/verify-group", { method: "POST", body: JSON.stringify({ name: groupName, verified }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      setResult(data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[11px] font-bold uppercase tracking-widest text-ink-3 mb-3">Verify a Fanbase group</p>

      {pending === null ? (
        <p className="text-xs text-ink-3 mb-3">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-xs text-ink-3 mb-3">No pending verification requests.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-3">
          {pending.map((g) => (
            <div key={g.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-semibold">{g.name}</p>
                <p className="text-[11px] text-ink-3">by {g.creator.displayName}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggle(g.name, true)}
                  disabled={busy === g.name}
                  className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Verify
                </button>
                <button
                  type="button"
                  onClick={() => toggle(g.name, false)}
                  disabled={busy === g.name}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setResult(null);
          }}
          placeholder="group name"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
        <button
          type="button"
          onClick={() => toggle(name, true)}
          disabled={busy === name || !name.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Verify
        </button>
        <button
          type="button"
          onClick={() => toggle(name, false)}
          disabled={busy === name || !name.trim()}
          className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-2 disabled:opacity-40"
        >
          Unverify
        </button>
      </div>
      {error && <p className="text-xs text-red-soft">{error}</p>}
      {result && (
        <p className="text-xs text-ink-3">
          &quot;{result.name}&quot; is now {result.isVerified ? "verified" : "not verified"}.
        </p>
      )}
    </div>
  );
}
