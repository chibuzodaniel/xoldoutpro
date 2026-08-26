"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";
import { GrowthChart } from "@/components/moderation/GrowthChart";
import { useModeratorSession } from "@/lib/useModeratorSession";

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
  const { firebaseUser, appUser, loading } = useAuth();
  const toast = useToast();
  const { verified: otpVerified, markVerified } = useModeratorSession();
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
      if (action === "takedown") {
        const data: { refundFailures?: { orderId: string; reason: string }[] } = await res.json();
        if (data.refundFailures && data.refundFailures.length > 0) {
          toast.error(
            `Taken down, but ${data.refundFailures.length} order${data.refundFailures.length === 1 ? "" : "s"} couldn't be auto-refunded — check the wallet ledger and refund manually via Flutterwave.`,
          );
        } else {
          toast.success("Taken down and every paid buyer refunded.");
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingSpinner full size="lg" />;
  // /moderation owns its own auth gate (app/(app)/layout.tsx's SELF_GATED) —
  // a signed-out visitor gets a login form right here, not a bounce through
  // the consumer /login page.
  if (!firebaseUser) return <ModeratorLoginForm />;
  if (!appUser) return <LoadingSpinner full size="lg" />; // firebaseUser exists but the Postgres row hasn't synced yet
  if (!appUser.isModerator) {
    return (
      <div className="px-4 py-6">
        <h1 className="font-serif text-2xl mb-2">Moderation</h1>
        <p className="text-sm text-ink-3">You don&apos;t have access to this page.</p>
      </div>
    );
  }
  // Explicit ask: the same email/password as their regular account gets a
  // moderator to here, but a one-time code is still required every time the
  // 60s inactivity window (useModeratorSession) has lapsed.
  if (!otpVerified) return <ModeratorOtpForm email={appUser.email} onVerified={markVerified} />;

  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-1">Moderation queue</h1>
      <p className="text-xs text-ink-3 mb-6">Open and in-review reports, soonest SLA first.</p>

      <PlatformStatsPanel />
      <GrowthChart />
      <UsersListPanel />

      {appUser.isSuperModerator && <ManageModeratorsPanel />}
      <VerifyCreatorPanel />
      <VerifyGroupPanel />
      <VerificationQueuePanel />
      <RestoreAccountPanel />

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
                  <span className="rounded-full bg-red/10 text-red-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                    {REASON_LABEL[r.reason]}
                  </span>
                  {sla && (
                    <span className={`text-[12px] font-semibold ${sla.overdue ? "text-red-soft" : "text-ink-3"}`}>{sla.text}</span>
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
                <p className="text-[12px] text-ink-3 mb-3">
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

type PlatformStats = {
  totalUsers: number;
  activeUsers: number;
  deletedUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  newUsers30d: number;
  totalModerators: number;
  totalCreators: number;
};

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
      <p className="font-serif text-2xl">{value}</p>
      <p className="text-[11px] uppercase tracking-widest text-ink-3 mt-0.5">{label}</p>
    </div>
  );
}

// Explicit ask: "track of users and how the platform is growing" — a KPI
// row of stat tiles for the headline numbers, plus GrowthChart (see that
// component) for the actual day/week/month/year trend with a signed,
// colored delta. The creator-facing /api/analytics deliberately stayed
// stat-tiles-only ("the PRD requires the metrics, not a visualization") —
// this is the different, later ask the dataviz skill was flagged for then.
function PlatformStatsPanel() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/admin/stats");
      if (!res.ok) return;
      setStats(await res.json());
    }
    load();
  }, []);

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Platform growth</p>
      {stats === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <StatTile label="Total users" value={stats.totalUsers} />
            <StatTile label="Creators" value={stats.totalCreators} />
            <StatTile label="Moderators" value={stats.totalModerators} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="New today" value={stats.newUsers24h} />
            <StatTile label="New this week" value={stats.newUsers7d} />
            <StatTile label="New this month" value={stats.newUsers30d} />
          </div>
          {stats.deletedUsers > 0 && (
            <p className="text-[11px] text-ink-3 mt-2">
              {stats.activeUsers} active · {stats.deletedUsers} deleted (within recovery window or beyond)
            </p>
          )}
        </>
      )}
    </div>
  );
}

type UserRow = {
  id: string;
  handle: string;
  displayName: string;
  email: string;
  createdAt: string;
  deletedAt: string | null;
  isModerator: boolean;
  isVerified: boolean;
  listingCount: number;
};

type UsersPage = { users: UserRow[]; page: number; totalPages: number; total: number };

// Explicit ask: "moderators should be able to see the list of users in
// their dashboard" — a searchable, paginated directory. Emails are shown
// here (unlike ManageModeratorsPanel, which hides moderator emails from
// peer moderators) because looking up an ordinary user by email is normal
// moderator/support work, not a privacy concern between staff.
function UsersListPanel() {
  const [q, setQ] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard debounced-fetch-on-input-change pattern
    setLoading(true);
    setExpandedId(null); // clears a stale expanded row when the query/filter/page changes underneath it
    const handle = setTimeout(async () => {
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set("q", q.trim());
      if (includeDeleted) params.set("includeDeleted", "1");
      const res = await apiFetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) setData(await res.json());
      setLoading(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [q, includeDeleted, page]);

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Users {data ? `(${data.total})` : ""}</p>

      <div className="flex gap-2 mb-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search by handle, name, or email"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink-3 mb-3">
        <input
          type="checkbox"
          checked={includeDeleted}
          onChange={(e) => {
            setIncludeDeleted(e.target.checked);
            setPage(1);
          }}
        />
        Include deleted accounts
      </label>

      {loading && data === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : data === null || data.users.length === 0 ? (
        <p className="text-xs text-ink-3">No users found.</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {data.users.map((u) => {
              const expanded = expandedId === u.id;
              return (
                <div key={u.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : u.id)}
                    className="w-full flex items-center justify-between gap-3 py-2.5 text-left"
                  >
                    <p className="text-sm truncate min-w-0">
                      {u.displayName} <span className="text-ink-3">@{u.handle}</span>
                      {u.isVerified && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Verified</span>}
                      {u.isModerator && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-ink-3">Mod</span>}
                      {u.deletedAt && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Deleted</span>}
                    </p>
                    <span className="text-ink-3 shrink-0">{expanded ? "▾" : "›"}</span>
                  </button>
                  {expanded && (
                    <div className="flex items-center justify-between gap-3 pb-3">
                      <p className="text-[11px] text-ink-3 truncate">
                        {u.email} · joined {new Date(u.createdAt).toLocaleDateString("en-NG")} · {u.listingCount} listing
                        {u.listingCount === 1 ? "" : "s"}
                      </p>
                      <Link href={`/u/${u.handle}`} className="text-xs font-semibold shrink-0">
                        View
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-[11px] text-ink-3">
                Page {data.page} of {data.totalPages}
              </p>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={loading || page >= data.totalPages}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

type ModeratorRow = { id: string; handle: string; displayName: string; isSuperModerator: boolean };

// Only super-moderators see this — grants/revokes plain isModerator by
// handle, and (explicit ask) lets an existing super-moderator promote/demote
// other moderators to/from super-moderator too. The very first
// super-moderator still has to be set directly in the DB (PRD §3: internal
// staff, not a self-serve chain from nothing) — this only manages who else
// gets that status once at least one exists. POST /api/admin/moderators
// itself refuses to demote the last remaining super-moderator, so this UI
// can't lock everyone out even if the confirm step below is skipped.
function ManageModeratorsPanel() {
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [moderators, setModerators] = useState<ModeratorRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/moderators");
    if (!res.ok) return;
    const data: { moderators: ModeratorRow[] } = await res.json();
    setModerators(data.moderators);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      const res = await apiFetch("/api/admin/moderators");
      if (!res.ok) return;
      const data: { moderators: ModeratorRow[] } = await res.json();
      setModerators(data.moderators);
    }
    initialLoad();
  }, []);

  async function setModeratorStatus(targetHandle: string, isModerator: boolean) {
    const trimmed = targetHandle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/moderators", {
        method: "POST",
        body: JSON.stringify({ handle: trimmed, isModerator }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      toast.success(`@${trimmed} is ${isModerator ? "now a moderator" : "no longer a moderator"}.`);
      setHandle("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function setSuperStatus(targetHandle: string, isSuperModerator: boolean) {
    if (isSuperModerator) {
      const ok = window.confirm(`Make @${targetHandle} a super-moderator? They'll be able to promote/demote other moderators too.`);
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/moderators", {
        method: "POST",
        body: JSON.stringify({ handle: targetHandle, isSuperModerator }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      toast.success(`@${targetHandle} is ${isSuperModerator ? "now a super-moderator" : "no longer a super-moderator"}.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Manage moderators</p>
      <div className="flex gap-2 mb-3">
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="handle"
          className="flex-1 rounded-lg border border-line bg-transparent px-3 py-2 text-sm outline-none focus:border-red"
        />
        <button
          type="button"
          onClick={() => setModeratorStatus(handle, true)}
          disabled={busy || !handle.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Grant
        </button>
      </div>

      {moderators === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : moderators.length === 0 ? (
        <p className="text-xs text-ink-3">No moderators yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {moderators.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm">
                  {m.displayName} <span className="text-ink-3">@{m.handle}</span>
                  {m.isSuperModerator && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-red-soft">Super</span>}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setSuperStatus(m.handle, !m.isSuperModerator)}
                  disabled={busy}
                  className="text-xs font-semibold text-ink-3 disabled:opacity-40"
                >
                  {m.isSuperModerator ? "Remove super" : "Make super"}
                </button>
                {!m.isSuperModerator && (
                  <button
                    type="button"
                    onClick={() => setModeratorStatus(m.handle, false)}
                    disabled={busy}
                    className="text-xs text-red-soft font-semibold disabled:opacity-40"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
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
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Verify a creator</p>
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

// Escape hatch once a self-deleted account's 45-day recovery window has
// closed (see /api/account/recover) — no deadline check on this endpoint,
// a moderator can restore at any point after.
function RestoreAccountPanel() {
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<{ handle: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch("/api/admin/restore-account", { method: "POST", body: JSON.stringify({ handle: trimmed }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not restore");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Restore a deleted account</p>
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
          onClick={restore}
          disabled={busy || !handle.trim()}
          className="rounded-lg bg-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          Restore
        </button>
      </div>
      {error && <p className="text-xs text-red-soft">{error}</p>}
      {result && <p className="text-xs text-ink-3">@{result.handle} has been restored.</p>}
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
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Verify a Fanbase group</p>

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
                <p className="text-[12px] text-ink-3">by {g.creator.displayName}</p>
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

type QueueApplication = {
  id: string;
  type: string;
  status: string;
  submittedAt: string | null;
  user: { handle: string; displayName: string };
  group: { id: string; name: string } | null;
  documents: { id: string; documentType: string; status: string; uploadedAt: string }[];
};

type QueueApplicationDetail = Omit<QueueApplication, "documents"> & {
  legalFirstName: string | null;
  legalLastName: string | null;
  dateOfBirth: string | null;
  country: string | null;
  region: string | null;
  phone: string | null;
  documentType: string | null;
  documentNumber: string | null;
  categoryData: { notes?: string } | null;
  eligibilitySnapshot: unknown;
  internalNotes: string | null;
  grantedBadgeType: string | null;
  rejectionReason: string | null;
  additionalInfoRequest: string | null;
  suspendedReason: string | null;
  revokedReason: string | null;
  documents: { id: string; documentType: string; status: string; uploadedAt: string; viewUrl: string }[];
  auditLogs: { id: string; action: string; createdAt: string; metadata: unknown; actor: { handle: string; displayName: string } }[];
};

const QUEUE_FILTERS = [
  { value: "", label: "Open (submitted / in review)" },
  { value: "APPROVED", label: "Approved (suspend/revoke)" },
  { value: "ALL", label: "All" },
] as const;

// Review queue for VerificationApplication (schema-backed, PRD §12/§18-aware
// workflow) — distinct from VerifyCreatorPanel/VerifyGroupPanel above, which
// are the older blunt toggles kept for backward compatibility.
function VerificationQueuePanel() {
  const toast = useToast();
  const [filter, setFilter] = useState<(typeof QUEUE_FILTERS)[number]["value"]>("");
  const [queue, setQueue] = useState<QueueApplication[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QueueApplicationDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [fanbaseBadge, setFanbaseBadge] = useState<"OFFICIAL_FANBASE" | "RECOGNIZED_COMMUNITY">("OFFICIAL_FANBASE");

  const load = useCallback(async (statusFilter: string) => {
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    const res = await apiFetch(`/api/admin/verification/applications${qs}`);
    if (!res.ok) return setQueue([]);
    const data: { applications: QueueApplication[] } = await res.json();
    setQueue(data.applications);
  }, []);

  useEffect(() => {
    async function initialLoad() {
      const qs = filter ? `?status=${filter}` : "";
      const res = await apiFetch(`/api/admin/verification/applications${qs}`);
      if (!res.ok) return setQueue([]);
      const data: { applications: QueueApplication[] } = await res.json();
      setQueue(data.applications);
    }
    initialLoad();
  }, [filter]);

  async function expand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setMessageDraft("");
    const res = await apiFetch(`/api/admin/verification/applications/${id}`);
    if (res.ok) {
      const data: { application: QueueApplicationDetail } = await res.json();
      setDetail(data.application);
    }
  }

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/admin/verification/applications/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update application");
      toast.success("Updated.");
      await load(filter);
      setExpandedId(null);
      setDetail(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Verification applications</p>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-lg border border-line bg-transparent px-2 py-1 text-xs outline-none"
        >
          {QUEUE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {queue === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : queue.length === 0 ? (
        <p className="text-xs text-ink-3">Nothing here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {queue.map((a) => (
            <div key={a.id} className="rounded-lg border border-line-soft">
              <button type="button" onClick={() => expand(a.id)} className="w-full flex items-center justify-between p-3 text-left">
                <div>
                  <p className="text-sm font-semibold">
                    {a.type} · {a.group ? a.group.name : a.user.displayName} <span className="text-ink-3">@{a.user.handle}</span>
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {a.status} · {a.submittedAt ? new Date(a.submittedAt).toLocaleString("en-NG") : "not submitted"} · {a.documents.length} doc
                    {a.documents.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="text-ink-3">{expandedId === a.id ? "▾" : "›"}</span>
              </button>

              {expandedId === a.id && (
                <div className="border-t border-line-soft p-3">
                  {detail === null ? (
                    <p className="text-xs text-ink-3">Loading…</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="text-xs text-ink-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>Name: {[detail.legalFirstName, detail.legalLastName].filter(Boolean).join(" ") || "—"}</span>
                        <span>DOB: {detail.dateOfBirth ? new Date(detail.dateOfBirth).toLocaleDateString() : "—"}</span>
                        <span>Country: {detail.country || "—"}</span>
                        <span>Region: {detail.region || "—"}</span>
                        <span>Phone: {detail.phone || "—"}</span>
                        <span>
                          ID: {detail.documentType || "—"} {detail.documentNumber ? `· ${detail.documentNumber}` : ""}
                        </span>
                      </div>
                      {detail.categoryData?.notes && (
                        <p className="text-xs text-ink-2">
                          <span className="text-ink-3">Notes: </span>
                          {detail.categoryData.notes}
                        </p>
                      )}

                      {detail.documents.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {detail.documents.map((d) => (
                            <a
                              key={d.id}
                              href={d.viewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold"
                            >
                              View {d.documentType}
                            </a>
                          ))}
                        </div>
                      )}

                      {detail.auditLogs.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          {detail.auditLogs.map((log) => (
                            <p key={log.id} className="text-[11px] text-ink-3">
                              {new Date(log.createdAt).toLocaleString("en-NG")} — {log.action} by {log.actor.displayName}
                            </p>
                          ))}
                        </div>
                      )}

                      {["SUBMITTED", "UNDER_REVIEW", "MORE_INFO_REQUIRED"].includes(detail.status) && (
                        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
                          <div className="flex flex-wrap gap-2">
                            {detail.status === "SUBMITTED" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => act(detail.id, { action: "under_review" })}
                                className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                              >
                                Start review
                              </button>
                            )}
                            {detail.type === "FANBASE" ? (
                              <>
                                <select
                                  value={fanbaseBadge}
                                  onChange={(e) => setFanbaseBadge(e.target.value as typeof fanbaseBadge)}
                                  className="rounded-lg border border-line bg-transparent px-2 py-1.5 text-xs outline-none"
                                >
                                  <option value="OFFICIAL_FANBASE">Official fanbase</option>
                                  <option value="RECOGNIZED_COMMUNITY">Recognized community</option>
                                </select>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => act(detail.id, { action: "approve", fanbaseBadge })}
                                  className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                  Approve
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => act(detail.id, { action: "approve" })}
                                className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                              >
                                Approve
                              </button>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={messageDraft}
                              onChange={(e) => setMessageDraft(e.target.value)}
                              placeholder="Reason / message"
                              className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs outline-none focus:border-red"
                            />
                            <button
                              type="button"
                              disabled={busy || !messageDraft.trim()}
                              onClick={() => act(detail.id, { action: "request_info", message: messageDraft.trim() })}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40 shrink-0"
                            >
                              Request info
                            </button>
                            <button
                              type="button"
                              disabled={busy || !messageDraft.trim()}
                              onClick={() => act(detail.id, { action: "reject", reason: messageDraft.trim() })}
                              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-red-soft disabled:opacity-40 shrink-0"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {detail.status === "APPROVED" && (
                        <div className="flex gap-2 border-t border-line-soft pt-3">
                          <input
                            value={messageDraft}
                            onChange={(e) => setMessageDraft(e.target.value)}
                            placeholder="Reason"
                            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs outline-none focus:border-red"
                          />
                          <button
                            type="button"
                            disabled={busy || !messageDraft.trim()}
                            onClick={() => act(detail.id, { action: "suspend", reason: messageDraft.trim() })}
                            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40 shrink-0"
                          >
                            Suspend
                          </button>
                          <button
                            type="button"
                            disabled={busy || !messageDraft.trim()}
                            onClick={() => act(detail.id, { action: "revoke", reason: messageDraft.trim() })}
                            className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 shrink-0"
                          >
                            Revoke
                          </button>
                        </div>
                      )}

                      {detail.status === "SUSPENDED" && (
                        <div className="flex gap-2 border-t border-line-soft pt-3">
                          <input
                            value={messageDraft}
                            onChange={(e) => setMessageDraft(e.target.value)}
                            placeholder="Reason"
                            className="flex-1 rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs outline-none focus:border-red"
                          />
                          <button
                            type="button"
                            disabled={busy || !messageDraft.trim()}
                            onClick={() => act(detail.id, { action: "revoke", reason: messageDraft.trim() })}
                            className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 shrink-0"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// /moderation's own login gate (explicit ask: a moderator should be able to
// go straight here and log in, not get bounced through the consumer /login
// page first). Deliberately lighter than that page — no Google sign-in, no
// "create an account" link — moderator accounts are internal staff,
// provisioned directly in the DB (PRD §3), never self-serve signups.
// AuthProvider's onAuthStateChanged listener picks up the resulting
// firebaseUser automatically; this component doesn't need to redirect
// anywhere itself, ModerationPage just re-renders past this branch once
// appUser syncs in.
function ModeratorLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth) return setError("Firebase isn't configured yet. See .env.local.example.");
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Log in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-1">Moderator access</p>
        <h1 className="font-serif text-2xl mb-6">Moderation dashboard</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
          {error && <p className="text-sm text-red-soft">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

// The step-up factor on top of ModeratorLoginForm's email/password. Explicit
// ask: a code is only ever emailed when the moderator actively asks for one
// (the "Send code" button, or "Resend code" after) — not automatically the
// instant this mounts, which would fire a fresh email every single time the
// 60s inactivity window (useModeratorSession) lapses and bounces someone
// back here, even if they just glance away and come straight back. onVerified
// marks the session valid for another 60s of activity and hands control back
// to ModerationPage.
function ModeratorOtpForm({ email, onVerified }: { email: string; onVerified: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function requestCode() {
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/otp/request", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("Could not send a code — try again");
      setSent(true);
      if (data.emailSent) toast.success(`Code sent to ${maskEmail(email)}.`);
      else toast.error("Couldn't confirm the code email went out — check spam, or resend.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/otp/verify", { method: "POST", body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Invalid code");
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (!sent) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-1">Verify it&apos;s you</p>
          <h1 className="font-serif text-2xl mb-2">One more step</h1>
          <p className="text-sm text-ink-3 mb-6">We&apos;ll email a 6-digit code to {maskEmail(email)}.</p>
          {error && <p className="text-sm text-red-soft mb-3">{error}</p>}
          <button
            type="button"
            onClick={requestCode}
            disabled={sending}
            className="w-full rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send code"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-[12px] tracking-[0.22em] uppercase text-red font-semibold mb-1">Verify it&apos;s you</p>
        <h1 className="font-serif text-2xl mb-2">Enter your code</h1>
        <p className="text-sm text-ink-3 mb-6">We sent a 6-digit code to {maskEmail(email)}.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-center text-lg tracking-[0.4em] outline-none transition-colors duration-150 focus:border-red"
          />
          {error && <p className="text-sm text-red-soft">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="mt-2 rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>

        <button type="button" onClick={requestCode} disabled={sending} className="mt-4 text-xs text-ink-3 disabled:opacity-50">
          {sending ? "Sending…" : "Resend code"}
        </button>
      </div>
    </main>
  );
}
