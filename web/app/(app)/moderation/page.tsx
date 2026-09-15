"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase/client";
import { friendlyFirebaseError } from "@/lib/auth/firebaseError";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/ToastProvider";
import { GrowthChart } from "@/components/moderation/GrowthChart";
import { useModeratorSession } from "@/lib/useModeratorSession";
import { BackHeader } from "@/components/ui/BackHeader";
import { uploadImage } from "@/lib/uploadImage";
import { ImageCropModal } from "@/components/upload/ImageCropModal";

// Matches components/discover/BillboardRail.tsx's aspect-[4/5] display —
// cropping to the same ratio here means what a moderator frames is exactly
// what shows on Discover, not a server-side center-crop guess.
const BILLBOARD_ASPECT = 4 / 5;
const BILLBOARD_OUTPUT_WIDTH = 1024;
const BILLBOARD_OUTPUT_HEIGHT = 1280;

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
  const [panelVisibility, setPanelVisibility] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (!appUser?.isModerator) return;
    async function loadVisibility() {
      const res = await apiFetch("/api/admin/panel-visibility");
      if (!res.ok) return;
      const data: { visibility: Record<string, boolean> } = await res.json();
      setPanelVisibility(data.visibility);
    }
    loadVisibility();
  }, [appUser]);

  // Super-moderators always see every panel regardless of the configured
  // visibility — same "super-mods see everything" precedent as
  // ManageModeratorsPanel, which isn't configurable at all for that reason.
  function panelVisible(key: string): boolean {
    if (appUser?.isSuperModerator) return true;
    if (panelVisibility === null) return false;
    return panelVisibility[key] ?? true;
  }

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
      toast.error(err instanceof Error ? err.message : "Something went wrong");
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
    <div className="pb-6">
      <BackHeader title="Moderation queue" />
      <div className="px-4">
      <p className="text-xs text-ink-3 mb-6">Open and in-review reports, soonest SLA first.</p>

      {appUser.isSuperModerator && <SiteControlsPanel panelVisibility={panelVisibility} onVisibilityChange={setPanelVisibility} />}

      {panelVisible("finance") && <PlatformFinancePanel />}
      {panelVisible("stats") && (
        <>
          <PlatformStatsPanel />
          <GrowthChart />
        </>
      )}
      {panelVisible("users") && <UsersListPanel />}

      {appUser.isSuperModerator && <ManageModeratorsPanel />}
      {panelVisible("ambassadors") && <AmbassadorsPanel />}
      {panelVisible("eventPromoters") && <EventPromotersModPanel />}
      {panelVisible("billboards") && <BillboardsPanel />}
      {panelVisible("verifyCreator") && <VerifyCreatorPanel />}
      {panelVisible("verifyGroup") && <VerifyGroupPanel />}
      {panelVisible("verificationQueue") && <VerificationQueuePanel />}
      {panelVisible("restoreAccount") && <RestoreAccountPanel />}

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
    </div>
  );
}

const PANEL_LABEL: Record<string, string> = {
  finance: "Platform finance",
  stats: "Platform growth",
  users: "User directory",
  ambassadors: "Ambassadors",
  eventPromoters: "Ticket promoters",
  billboards: "Billboards",
  verifyCreator: "Verify creator",
  verifyGroup: "Verify group",
  verificationQueue: "Verification queue",
  restoreAccount: "Restore account",
};
const PANEL_KEYS = Object.keys(PANEL_LABEL);

// Super-moderator-only: platform-wide toggles (currently just real-file
// downloads for songs/beats) and which of the panels below a *regular*
// moderator sees. Explicit ask, 2026-09-14: "super moderator should be
// able to turn on/off for the file download... and also be able to select
// what's visible for other moderators."
function SiteControlsPanel({
  panelVisibility,
  onVisibilityChange,
}: {
  panelVisibility: Record<string, boolean> | null;
  onVisibilityChange: (v: Record<string, boolean>) => void;
}) {
  const toast = useToast();
  const [downloadsEnabled, setDownloadsEnabled] = useState<boolean | null>(null);
  const [billboardRateKobo, setBillboardRateKobo] = useState<number | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/admin/settings");
      if (!res.ok) return;
      const data: { downloadsEnabled: boolean; billboardDailyRateKobo: number } = await res.json();
      setDownloadsEnabled(data.downloadsEnabled);
      setBillboardRateKobo(data.billboardDailyRateKobo);
      setRateInput(String(data.billboardDailyRateKobo / 100));
    }
    load();
  }, []);

  async function saveBillboardRate() {
    const naira = Number(rateInput);
    if (!Number.isFinite(naira) || naira <= 0) return;
    setBusy(true);
    try {
      const kobo = Math.round(naira * 100);
      const res = await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ billboardDailyRateKobo: kobo }) });
      if (!res.ok) throw new Error("Could not update rate");
      setBillboardRateKobo(kobo);
      toast.success(`Billboard rate is now ₦${naira.toLocaleString("en-NG")}/day.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function toggleDownloads(enabled: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/settings", { method: "PATCH", body: JSON.stringify({ downloadsEnabled: enabled }) });
      if (!res.ok) throw new Error("Could not update setting");
      setDownloadsEnabled(enabled);
      toast.success(`File downloads are now ${enabled ? "on" : "off"} for everyone.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function togglePanel(key: string, visible: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/panel-visibility", {
        method: "PATCH",
        body: JSON.stringify({ panelKey: key, visible }),
      });
      if (!res.ok) throw new Error("Could not update panel visibility");
      onVisibilityChange({ ...(panelVisibility ?? {}), [key]: visible });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Site controls</p>

      <div className="flex items-center justify-between py-2.5 border-b border-line-soft mb-3">
        <div>
          <p className="text-sm font-semibold">Song/beat file downloads</p>
          <p className="text-xs text-ink-3">Turns the real-file Download button off for everyone when disabled.</p>
        </div>
        {downloadsEnabled === null ? (
          <span className="text-xs text-ink-3">Loading…</span>
        ) : (
          <button
            type="button"
            onClick={() => toggleDownloads(!downloadsEnabled)}
            disabled={busy}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
              downloadsEnabled ? "bg-green/15 text-green" : "bg-red/15 text-red-soft"
            }`}
          >
            {downloadsEnabled ? "On" : "Off"}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between py-2.5 border-b border-line-soft mb-3">
        <div>
          <p className="text-sm font-semibold">Billboard daily rate</p>
          <p className="text-xs text-ink-3">What a creator pays per day for the Discover billboard rail.</p>
        </div>
        {billboardRateKobo === null ? (
          <span className="text-xs text-ink-3">Loading…</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3">₦</span>
            <input
              type="number"
              min={1}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={saveBillboardRate}
              disabled={busy}
              className="rounded-full bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-ink-3 mb-2">Visible to regular moderators</p>
      {panelVisibility === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {PANEL_KEYS.map((key) => (
            <label key={key} className="flex items-center justify-between py-2.5 text-sm">
              <span>{PANEL_LABEL[key]}</span>
              <input
                type="checkbox"
                checked={panelVisibility[key] ?? true}
                disabled={busy}
                onChange={(e) => togglePanel(key, e.target.checked)}
                className="h-4 w-4"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

type PlatformFinancials = {
  platformRevenueKobo: number;
  netIncomeKobo: number;
  owingKobo: number;
  paidKobo: number;
  ambassadorCommissionsKobo: number;
  promoterPayoutsKobo: number;
  billboardRevenueKobo: number;
  refundedKobo: number;
  revenueByType: Record<string, number>;
  payoutsByStatus: Record<string, { count: number; amountKobo: number }>;
};

const PRODUCT_TYPE_LABEL: Record<string, string> = { RELEASE: "Music", BEAT: "Beats", EVENT: "Events", MERCH: "Merch" };
const PAYOUT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
};

function formatNairaFull(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Explicit ask: "moderators should see platform revenue, owing, net
// income, paid" — expanded to "everything concerning finance" on
// follow-up. See lib/commerce/ledger.ts's getPlatformFinancials for exactly
// what each figure means (revenue vs. net income vs. owing vs. paid are
// each a genuinely different number here, not aliases of each other).
function PlatformFinancePanel() {
  const [financials, setFinancials] = useState<PlatformFinancials | null>(null);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/admin/finance");
      if (!res.ok) return;
      setFinancials(await res.json());
    }
    load();
  }, []);

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Platform finance</p>
      {financials === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <StatTile label="Revenue" value={formatNairaFull(financials.platformRevenueKobo)} />
            <StatTile label="Net income" value={formatNairaFull(financials.netIncomeKobo)} />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <StatTile label="Owing" value={formatNairaFull(financials.owingKobo)} />
            <StatTile label="Paid" value={formatNairaFull(financials.paidKobo)} />
          </div>

          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-4">
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-ink-3">Ambassador commissions paid</span>
              <span>{formatNairaFull(financials.ambassadorCommissionsKobo)}</span>
            </div>
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-ink-3">Ticket promoter payouts</span>
              <span>{formatNairaFull(financials.promoterPayoutsKobo)}</span>
            </div>
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-ink-3">Billboard revenue</span>
              <span>{formatNairaFull(financials.billboardRevenueKobo)}</span>
            </div>
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-ink-3">Refunded to sellers (net)</span>
              <span>{formatNairaFull(financials.refundedKobo)}</span>
            </div>
          </div>

          <p className="text-xs text-ink-3 mb-2">Revenue by category</p>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-4">
            {Object.entries(financials.revenueByType).length === 0 ? (
              <p className="text-xs text-ink-3 py-2">No sales yet.</p>
            ) : (
              Object.entries(financials.revenueByType).map(([type, kobo]) => (
                <div key={type} className="flex items-center justify-between py-2 text-xs">
                  <span className="text-ink-3">{PRODUCT_TYPE_LABEL[type] ?? type}</span>
                  <span>{formatNairaFull(kobo)}</span>
                </div>
              ))
            )}
          </div>

          <p className="text-xs text-ink-3 mb-2">Payouts by status</p>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {Object.entries(financials.payoutsByStatus).length === 0 ? (
              <p className="text-xs text-ink-3 py-2">No withdrawals yet.</p>
            ) : (
              Object.entries(financials.payoutsByStatus).map(([status, s]) => (
                <div key={status} className="flex items-center justify-between py-2 text-xs">
                  <span className="text-ink-3">{PAYOUT_STATUS_LABEL[status] ?? status}</span>
                  <span>
                    {s.count} · {formatNairaFull(s.amountKobo)}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
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

type TierRate = { tier: "SILVER" | "GOLD"; firstPurchasePercent: number; continuousPercent: number };
type PendingAmbassadorApplication = { id: string; pitch: string | null; user: { handle: string; displayName: string } };
type AmbassadorRow = {
  id: string;
  handle: string;
  displayName: string;
  referredCount: number;
  activeInviteCount: number;
  revenueGeneratedKobo: number;
  tier: "SILVER" | "GOLD";
  firstPurchasePercent: number;
  continuousPercent: number;
  walletAvailableKobo: number;
};

function formatNairaShort(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Ambassador program (platform-wide referral role — distinct from the
// per-event ticket promoters managed on each event's own page). Payout is
// fully automatic per sale (lib/commerce/ledger.ts's
// recordAmbassadorCommission) — this panel only reviews applications and
// sets the tier rates that drive those automatic payouts, never a manual
// per-ambassador payout amount.
// Explicit Save button (not auto-save-on-blur) since two related fields
// need to be sent together — editing one shouldn't fire a request with the
// other field's stale server value.
function TierRateEditor({
  rate,
  busy,
  onSave,
}: {
  rate: TierRate;
  busy: boolean;
  onSave: (tier: TierRate["tier"], firstPurchasePercent: number, continuousPercent: number) => void;
}) {
  const [firstPurchasePercent, setFirstPurchasePercent] = useState(rate.firstPurchasePercent);
  const [continuousPercent, setContinuousPercent] = useState(rate.continuousPercent);
  const dirty = firstPurchasePercent !== rate.firstPurchasePercent || continuousPercent !== rate.continuousPercent;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line p-2">
      <span className="text-[10px] uppercase tracking-widest text-ink-3">{rate.tier}</span>
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-2">First purchase %</span>
        <input
          type="number"
          min={0}
          max={100}
          value={firstPurchasePercent}
          disabled={busy}
          onChange={(e) => setFirstPurchasePercent(Number(e.target.value))}
          className="w-16 rounded-lg border border-line bg-transparent px-2 py-1 text-sm outline-none focus:border-red"
        />
      </label>
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-2">Continuous %</span>
        <input
          type="number"
          min={0}
          max={100}
          value={continuousPercent}
          disabled={busy}
          onChange={(e) => setContinuousPercent(Number(e.target.value))}
          className="w-16 rounded-lg border border-line bg-transparent px-2 py-1 text-sm outline-none focus:border-red"
        />
      </label>
      {dirty && (
        <button
          type="button"
          onClick={() => onSave(rate.tier, firstPurchasePercent, continuousPercent)}
          disabled={busy}
          className="rounded-lg bg-red px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
      )}
    </div>
  );
}

function AmbassadorsPanel() {
  const toast = useToast();
  const [rates, setRates] = useState<TierRate[] | null>(null);
  const [pending, setPending] = useState<PendingAmbassadorApplication[] | null>(null);
  const [ambassadors, setAmbassadors] = useState<AmbassadorRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [ratesRes, ambassadorsRes] = await Promise.all([
      apiFetch("/api/admin/ambassadors/tier-rates"),
      apiFetch("/api/admin/ambassadors"),
    ]);
    if (ratesRes.ok) setRates((await ratesRes.json()).rates);
    if (ambassadorsRes.ok) {
      const data = await ambassadorsRes.json();
      setPending(data.pendingApplications);
      setAmbassadors(data.ambassadors);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, [load]);

  async function saveRate(tier: TierRate["tier"], firstPurchasePercent: number, continuousPercent: number) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/ambassadors/tier-rates", {
        method: "PATCH",
        body: JSON.stringify({ tier, firstPurchasePercent, continuousPercent }),
      });
      if (!res.ok) throw new Error("Could not update rate");
      toast.success(`${tier} now pays ${firstPurchasePercent}% first purchase / ${continuousPercent}% continuous.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function reviewApplication(id: string, action: "approve" | "reject") {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/admin/ambassadors/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      if (!res.ok) throw new Error("Could not update application");
      toast.success(action === "approve" ? "Ambassador approved." : "Application rejected.");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Ambassadors</p>

      <p className="text-xs text-ink-3 mb-2">
        Commission rates (% of the platform&apos;s own commission, paid automatically per sale) — first purchase is what an
        ambassador earns the first time a person they invited buys anything; continuous is the rate after that.
      </p>
      {rates === null ? (
        <p className="text-xs text-ink-3 mb-4">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-5">
          {rates.map((r) => (
            <TierRateEditor key={r.tier} rate={r} busy={busy} onSave={saveRate} />
          ))}
        </div>
      )}

      <p className="text-xs text-ink-3 mb-2">Pending applications</p>
      {pending === null ? (
        <p className="text-xs text-ink-3 mb-4">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-xs text-ink-3 mb-4">Nothing pending.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-5">
          {pending.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="text-sm">
                  {a.user.displayName} <span className="text-ink-3">@{a.user.handle}</span>
                </p>
                {a.pitch && <p className="text-xs text-ink-3 truncate">{a.pitch}</p>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => reviewApplication(a.id, "approve")}
                  disabled={busy}
                  className="text-xs font-semibold text-green disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => reviewApplication(a.id, "reject")}
                  disabled={busy}
                  className="text-xs text-red-soft font-semibold disabled:opacity-40"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-3 mb-2">Ambassadors</p>
      {ambassadors === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : ambassadors.length === 0 ? (
        <p className="text-xs text-ink-3">No ambassadors yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
          {ambassadors.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm">
                  {a.displayName} <span className="text-ink-3">@{a.handle}</span>{" "}
                  <span className="text-[10px] uppercase tracking-widest text-red-soft">{a.tier}</span>
                </p>
                <p className="text-xs text-ink-3">
                  {a.referredCount} referred · {a.activeInviteCount} active · {formatNairaShort(a.revenueGeneratedKobo)} generated ·{" "}
                  {a.firstPurchasePercent}% / {a.continuousPercent}% · {formatNairaShort(a.walletAvailableKobo)} in wallet
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type BillboardRow = {
  id: string;
  status: "PENDING_PAYMENT" | "PENDING_REVIEW" | "ACTIVE" | "REJECTED" | "REMOVED";
  artworkUrl: string;
  days: number;
  paidKobo: number;
  expiresAt: string | null;
  isModeratorAdded: boolean;
  rejectionReason: string | null;
  creator: { handle: string; displayName: string } | null;
};

const BILLBOARD_STATUS_LABEL: Record<BillboardRow["status"], string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PENDING_REVIEW: "Awaiting review",
  ACTIVE: "Live",
  REJECTED: "Rejected",
  REMOVED: "Removed",
};

function RejectBillboardControl({ busy, onReject }: { busy: boolean; onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={busy} className="text-xs font-semibold text-red-soft disabled:opacity-40">
        Reject
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-40 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={() => reason.trim() && onReject(reason.trim())}
        disabled={busy || !reason.trim()}
        className="text-xs font-semibold text-red-soft disabled:opacity-40"
      >
        Confirm
      </button>
    </div>
  );
}

// Explicit ask, 2026-09-14: "moderators too should approve every billboard
// posted before it goes live and if it's rejected the owner should be
// refunded and the moderators should include reasons for rejection" — see
// lib/commerce/billboards.ts's approveBillboard/rejectBillboard (rejection
// always refunds what was actually paid). Also the manual-add control
// ("moderators can also add artwork there manually") and per-billboard
// duration override/removal.
function BillboardsPanel() {
  const toast = useToast();
  const [billboards, setBillboards] = useState<BillboardRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addCropFile, setAddCropFile] = useState<File | null>(null);
  const [addHandle, setAddHandle] = useState("");
  const [addDays, setAddDays] = useState(1);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/admin/billboards");
    if (res.ok) setBillboards((await res.json()).billboards);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state
    load();
  }, [load]);

  async function act(id: string, body: object) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/admin/billboards/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update billboard");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function handleManualAdd() {
    if (!addFile) return;
    setAdding(true);
    try {
      const artworkKey = await uploadImage(addFile, "billboard");
      const res = await apiFetch("/api/admin/billboards", {
        method: "POST",
        body: JSON.stringify({ artworkKey, creatorHandle: addHandle.trim() || undefined, durationDays: addDays }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not add billboard");
      toast.success("Billboard added.");
      setAddFile(null);
      setAddHandle("");
      setAddDays(1);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setAdding(false);
    }
  }

  const pending = billboards?.filter((b) => b.status === "PENDING_REVIEW") ?? [];
  const others = billboards?.filter((b) => b.status !== "PENDING_REVIEW") ?? [];

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Billboards</p>

      <p className="text-xs text-ink-3 mb-2">Awaiting review</p>
      {billboards === null ? (
        <p className="text-xs text-ink-3 mb-4">Loading…</p>
      ) : pending.length === 0 ? (
        <p className="text-xs text-ink-3 mb-4">Nothing pending.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-5">
          {pending.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote R2 artwork */}
              <img src={b.artworkUrl} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{b.creator ? `@${b.creator.handle}` : "House ad"}</p>
                <p className="text-xs text-ink-3">
                  {b.days} day{b.days === 1 ? "" : "s"} · {formatNairaShort(b.paidKobo)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => act(b.id, { action: "approve" })}
                  disabled={busyId === b.id}
                  className="text-xs font-semibold text-green disabled:opacity-40"
                >
                  Approve
                </button>
                <RejectBillboardControl busy={busyId === b.id} onReject={(reason) => act(b.id, { action: "reject", rejectionReason: reason })} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-3 mb-2">All billboards</p>
      {billboards === null ? (
        <p className="text-xs text-ink-3 mb-4">Loading…</p>
      ) : others.length === 0 ? (
        <p className="text-xs text-ink-3 mb-4">None yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-5">
          {others.map((b) => (
            <div key={b.id} className="flex items-center gap-3 py-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote R2 artwork */}
              <img src={b.artworkUrl} alt="" className="h-12 w-20 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">
                  {b.creator ? `@${b.creator.handle}` : "House ad"}{" "}
                  <span className="text-[10px] uppercase tracking-widest text-ink-3">{BILLBOARD_STATUS_LABEL[b.status]}</span>
                </p>
                <p className="text-xs text-ink-3">
                  {b.expiresAt ? `Until ${new Date(b.expiresAt).toLocaleString("en-NG")}` : `${b.days} day${b.days === 1 ? "" : "s"}`}
                  {b.rejectionReason ? ` · ${b.rejectionReason}` : ""}
                </p>
              </div>
              {b.status === "ACTIVE" && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => act(b.id, { extendDays: 1 })}
                    disabled={busyId === b.id}
                    className="text-xs font-semibold text-red-soft disabled:opacity-40"
                  >
                    +1 day
                  </button>
                  <button
                    type="button"
                    onClick={() => act(b.id, { status: "REMOVED" })}
                    disabled={busyId === b.id}
                    className="text-xs font-semibold text-ink-3 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-3 mb-2">Add manually (no payment)</p>
      <div className="flex flex-col gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) setAddCropFile(picked);
            e.target.value = "";
          }}
          className="text-xs"
        />
        {addCropFile && (
          <ImageCropModal
            file={addCropFile}
            aspect={BILLBOARD_ASPECT}
            outputWidth={BILLBOARD_OUTPUT_WIDTH}
            outputHeight={BILLBOARD_OUTPUT_HEIGHT}
            onCancel={() => setAddCropFile(null)}
            onConfirm={(cropped) => {
              setAddCropFile(null);
              setAddFile(cropped);
            }}
          />
        )}
        <div className="flex items-center gap-2">
          <input
            value={addHandle}
            onChange={(e) => setAddHandle(e.target.value)}
            placeholder="Creator handle (optional)"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
          />
          <input
            type="number"
            min={1}
            value={addDays}
            onChange={(e) => setAddDays(Number(e.target.value) || 1)}
            className="w-16 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
          />
          <span className="text-xs text-ink-3">days</span>
        </div>
        <button
          type="button"
          onClick={handleManualAdd}
          disabled={adding || !addFile}
          className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add billboard"}
        </button>
      </div>
    </div>
  );
}

// PRD §18: verification criteria are undecided — this is deliberately a
// blunt handle-lookup toggle, not a review workflow with evidence/criteria.
function VerifyCreatorPanel() {
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<{ handle: string; isVerified: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function toggle(verified: boolean) {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/verify", { method: "POST", body: JSON.stringify({ handle: trimmed, verified }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
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
  const toast = useToast();
  const [handle, setHandle] = useState("");
  const [result, setResult] = useState<{ handle: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function restore() {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await apiFetch("/api/admin/restore-account", { method: "POST", body: JSON.stringify({ handle: trimmed }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not restore");
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
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
      {result && <p className="text-xs text-ink-3">@{result.handle} has been restored.</p>}
    </div>
  );
}

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
function EventPromotersModPanel() {
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

type PendingGroup = {
  id: string;
  name: string;
  verificationRequestedAt: string;
  creator: { handle: string; displayName: string };
};

// Mirrors VerifyCreatorPanel above, plus a queue of groups that actually
// applied — a moderator otherwise has no way to know which names to look up.
function VerifyGroupPanel() {
  const toast = useToast();
  const [pending, setPending] = useState<PendingGroup[] | null>(null);
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ name: string; isVerified: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
    try {
      const res = await apiFetch("/api/admin/verify-group", { method: "POST", body: JSON.stringify({ name: groupName, verified }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not update");
      setResult(data);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
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
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseAuth) return toast.error("Firebase isn't configured yet. See .env.local.example.");
    setBusy(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
    } catch (err) {
      toast.error(friendlyFirebaseError(err, "Log in failed"));
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
          <PasswordInput
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          />
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
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function requestCode() {
    setSending(true);
    try {
      const res = await apiFetch("/api/admin/otp/request", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error("Could not send a code — try again");
      setSent(true);
      if (data.emailSent) toast.success(`Code sent to ${maskEmail(email)}.`);
      else toast.error("Couldn't confirm the code email went out — check spam, or resend.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send a code");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/otp/verify", { method: "POST", body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Invalid code");
      onVerified();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
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
