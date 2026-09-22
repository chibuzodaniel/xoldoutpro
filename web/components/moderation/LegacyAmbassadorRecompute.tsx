"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/ToastProvider";
import { formatNairaShort } from "./AmbassadorsPanel";

type RecomputeAdjustment = { orderId: string; ambassadorId: string; existingKobo: number; targetKobo: number; deltaKobo: number };
type RecomputeReport = {
  applied: boolean;
  ordersConsidered: number;
  adjustments: RecomputeAdjustment[];
  totalCreditKobo: number;
  totalDebitKobo: number;
  affectedAmbassadors: number;
  blockedByPaidPayouts: { id: string; userId: string; amountKobo: number }[];
};

// One-time correction tool (explicit ask, 2026-09-15): applies today's
// ambassador tier rates to every already-eligible historical order. See
// app/api/admin/ambassadors/recompute-legacy/route.ts for the exact rules
// and simplifications (current tier, not historical tier; never claws back
// past a completed payout). Preview is read-only; nothing is written until
// Apply is confirmed.
export function LegacyAmbassadorRecompute() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<RecomputeReport | null>(null);

  async function run(apply: boolean) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/ambassadors/recompute-legacy", {
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
      `Apply ${report.adjustments.length} adjustment(s) across ${report.affectedAmbassadors} ambassador(s)?\n\n` +
        `Total credit: ${formatNairaShort(report.totalCreditKobo)}\nTotal debit: ${formatNairaShort(report.totalDebitKobo)}\n\n` +
        `This writes new ledger entries and cannot be undone from this panel.`,
    );
    if (ok) run(true);
  }

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Legacy ambassador recompute</p>
      <p className="text-xs text-ink-3 mb-3">
        One-time: recomputes every already-eligible historical order&apos;s ambassador commission under today&apos;s tier
        rates (each ambassador&apos;s current tier, not their tier back then). Preview first — nothing is written until
        you click Apply. Refuses to apply if it would reduce an ambassador who already has a paid payout.
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
            {report.ordersConsidered} orders considered · {report.adjustments.length} adjustment(s) · {report.affectedAmbassadors}{" "}
            ambassador(s)
          </p>
          <p>
            Total credit: {formatNairaShort(report.totalCreditKobo)} · Total debit: {formatNairaShort(report.totalDebitKobo)}
          </p>
          {report.blockedByPaidPayouts.length > 0 && (
            <p className="text-red-soft">
              Blocked: {report.blockedByPaidPayouts.length} affected ambassador(s) already have a paid payout — resolve manually
              before this can apply.
            </p>
          )}
          {report.applied && <p className="text-green">Applied.</p>}
        </div>
      )}
    </div>
  );
}

