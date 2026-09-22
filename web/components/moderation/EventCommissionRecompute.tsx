"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { formatNairaShort } from "./AmbassadorsPanel";

type Adjustment = { orderId: string; sellerId: string; existingCommissionKobo: number; targetCommissionKobo: number; deltaKobo: number };
type RecomputeReport = {
  applied: boolean;
  ordersConsidered: number;
  adjustments: Adjustment[];
  totalCreditKobo: number;
  totalDebitKobo: number;
  affectedSellers: number;
  blockedByPaidPayouts: { id: string; userId: string; amountKobo: number }[];
};

// One-time correction tool (explicit ask, 2026-09-22): applies today's event
// commission rate(s) to every already-sold Event order. See app/api/admin/
// events/recompute-commission/route.ts for the exact per-plan rules —
// Buyer-Pays-Fee sellers are corrected best-effort against a reconstructed
// base price (the buyer's original payment is never touched), Limited
// sellers are never adjusted (0% regardless). Preview is read-only; nothing
// is written until Apply is confirmed.
export function EventCommissionRecompute() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RecomputeReport | null>(null);

  async function run(apply: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/events/recompute-commission", {
        method: "POST",
        body: JSON.stringify({ apply }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      setReport(json);
      toast.success(apply ? `Applied ${json.adjustments.length} adjustment(s).` : `Preview ready: ${json.adjustments.length} adjustment(s).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function confirmAndApply() {
    if (!report) return;
    const ok = window.confirm(
      `Apply ${report.adjustments.length} adjustment(s) across ${report.affectedSellers} seller(s)?\n\n` +
        `Total taken from sellers: ${formatNairaShort(report.totalDebitKobo)}\nTotal credited back to sellers: ${formatNairaShort(report.totalCreditKobo)}\n\n` +
        `This writes new ledger entries and cannot be undone from this panel.`,
    );
    if (ok) run(true);
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Event commission recompute</p>
      <p className="text-xs text-ink-3 mb-3">
        One-time: recomputes every already-sold Event order&apos;s platform commission under today&apos;s event rate(s) —
        Unlimited/no-plan sellers exactly, Buyer Pays Fee sellers best-effort (the buyer&apos;s original payment is never
        changed), Limited sellers never touched. Preview first — nothing is written until you click Apply. Refuses to
        apply if it would reduce a seller who already has a paid payout.
      </p>
      <div className="flex items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        >
          Preview (dry run)
        </button>
        {report && !report.applied && (
          <button
            type="button"
            onClick={confirmAndApply}
            disabled={busy || report.adjustments.length === 0 || report.blockedByPaidPayouts.length > 0}
            className="rounded-lg bg-red px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            Apply
          </button>
        )}
      </div>
      {report && (
        <div className="text-xs text-ink-2 space-y-1">
          <p>
            {report.ordersConsidered} orders considered · {report.adjustments.length} adjustment(s) · {report.affectedSellers} seller(s)
          </p>
          <p>
            Taken from sellers: {formatNairaShort(report.totalDebitKobo)} · Credited back to sellers: {formatNairaShort(report.totalCreditKobo)}
          </p>
          {report.blockedByPaidPayouts.length > 0 && (
            <p className="text-red-soft">
              Blocked: {report.blockedByPaidPayouts.length} affected seller(s) already have a paid payout — resolve manually before this
              can apply.
            </p>
          )}
          {report.applied && <p className="text-green">Applied.</p>}
        </div>
      )}
    </div>
  );
}
