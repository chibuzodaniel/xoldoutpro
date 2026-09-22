"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { StatTile } from "./PlatformStatsPanel";

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
export function PlatformFinancePanel() {
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
