"use client";

import { useCallback, useEffect, useState } from "react";
import { useCanUse } from "./access";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";

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

export function formatNairaShort(kobo: number) {
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
        <span className="text-xs text-ink-2">First purchase % (of sale)</span>
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
        <span className="text-xs text-ink-2">Continuous % (of sale)</span>
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

export function AmbassadorsPanel() {
  // Editing tier commission rates is its own switch.
  const canEditRates = useCanUse()("ambassadorRates");
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
        Commission rates (% of the sale price, carved out of the platform&apos;s own commission — never more than the
        commission itself, and never the seller&apos;s net) — first purchase is what an ambassador earns the first time a
        person they invited buys anything; continuous is the rate after that. A value at or above the product&apos;s own
        commission rate pays the ambassador that sale&apos;s entire commission.
      </p>
      {!canEditRates ? (
        <p className="text-xs text-ink-3 mb-5">Editing commission rates is turned off for moderators.</p>
      ) : rates === null ? (
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

