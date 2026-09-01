"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BackHeader } from "@/components/ui/BackHeader";
import { COMMISSION_RATE } from "@/lib/commerce/constants";

type WalletData = {
  availableKobo: number;
  pendingKobo: number;
  totalEarnedKobo: number;
  totalWithdrawnKobo: number;
  earnedByCategory: Record<string, number>;
  payouts: Payout[];
};

type Payout = {
  id: string;
  amountKobo: number;
  feeKobo: number;
  netKobo: number;
  status: string;
  processorRef: string | null;
  createdAt: string;
  payoutAccount: { bankName: string; accountNumber: string; accountName: string };
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "text-ink-3" },
  PROCESSING: { label: "Processing", className: "text-amber" },
  PAID: { label: "Paid", className: "text-green" },
  FAILED: { label: "Failed", className: "text-red-soft" },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, className: "text-ink-3" };
}

function PayoutDetailSheet({ payout, onClose }: { payout: Payout | null; onClose: () => void }) {
  const status = payout ? statusMeta(payout.status) : null;
  return (
    <div
      className={`fixed inset-0 z-50 flex items-end transition-colors duration-300 ${
        payout ? "bg-black/60" : "pointer-events-none bg-black/0"
      }`}
      onClick={onClose}
      aria-hidden={!payout}
    >
      <div
        className={`relative w-full rounded-t-2xl border-t border-line-soft bg-surface px-4 pt-6 pb-8 transition-transform duration-300 ease-out ${
          payout ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {payout && status && (
          <>
            <h1 className="font-serif text-2xl mb-1">Withdrawal details</h1>
            <p className={`text-[12px] uppercase tracking-widest font-semibold mb-5 ${status.className}`}>{status.label}</p>

            <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-5">
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-3">Amount</span>
                <span className="font-serif">{naira(payout.amountKobo)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-3">Fee</span>
                <span>{naira(payout.feeKobo)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-3">You received</span>
                <span className="font-serif font-semibold">{naira(payout.netKobo)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-3">Bank account</span>
                <span className="text-right">
                  {payout.payoutAccount.accountName}
                  <br />
                  <span className="text-ink-3">
                    {payout.payoutAccount.bankName} ···{payout.payoutAccount.accountNumber.slice(-4)}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-3">Date</span>
                <span>{formatDate(payout.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-3">Reference</span>
                <span className="font-mono text-[12px]">{payout.processorRef ?? payout.id}</span>
              </div>
            </div>

            {payout.status === "FAILED" && (
              <p className="text-xs text-ink-3 mb-5">
                This withdrawal didn&apos;t go through — the amount was returned to your available balance.
              </p>
            )}
            {payout.status === "PROCESSING" && (
              <p className="text-xs text-ink-3 mb-5">Your bank usually receives this within a few minutes to a few hours.</p>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-line py-3 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-line-strong hover:text-ink"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/wallet");
      if (res.ok) setData(await res.json());
    }
    load();
  }, []);

  if (!data) {
    return (
      <div>
        <BackHeader title="Wallet" />
        <LoadingSpinner full size="md" />
      </div>
    );
  }

  return (
    <div className="pb-6">
      <BackHeader title="Wallet" />
      <div className="px-4">

      <div className="rounded-xl border border-line bg-surface p-4 mb-1">
        <p className="text-[11px] uppercase tracking-widest text-ink-3">Available</p>
        <p className="font-serif text-3xl">{naira(data.availableKobo)}</p>
      </div>
      <p className="text-[11px] text-ink-3 mb-3">
        Totals shown are after our {Math.round(COMMISSION_RATE * 100)}% platform fee on each sale.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] uppercase tracking-widest text-ink-3">Pending</p>
          <p className="font-serif text-lg">{naira(data.pendingKobo)}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-[11px] uppercase tracking-widest text-ink-3">Total earned</p>
          <p className="font-serif text-lg">{naira(data.totalEarnedKobo)}</p>
        </div>
      </div>

      {/* Explicit ask, 2026-08-31, "for now": the 7-day settlement hold is
          off (lib/commerce/ledger.ts's recordSale), so a sale is
          withdrawable immediately — copy updated to match. Revert this
          alongside that file's own revert note if the hold comes back. */}
      <p className="text-[12px] text-ink-3 mb-6">
        Your earnings are available to withdraw right away — no waiting period.
      </p>

      <Link
        href="/wallet/withdraw"
        className="block w-full text-center rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white mb-3"
      >
        Withdraw
      </Link>
      <Link
        href="/wallet/payout-accounts"
        className="block w-full text-center rounded-lg border border-line px-4 py-3 text-sm font-semibold mb-8"
      >
        Payout accounts
      </Link>

      {Object.keys(data.earnedByCategory).length > 0 && (
        <div className="mb-8">
          <h2 className="text-[12px] uppercase tracking-widest text-ink-3 mb-3">Earned by category</h2>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {Object.entries(data.earnedByCategory).map(([type, kobo]) => (
              <div key={type} className="flex items-center justify-between py-2.5 text-sm">
                <span className="capitalize">{type.toLowerCase()}</span>
                <span className="font-serif">{naira(kobo)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-[12px] uppercase tracking-widest text-ink-3 mb-3">Payout history</h2>
        {data.payouts.length === 0 ? (
          <p className="text-sm text-ink-3">No payouts yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {data.payouts.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPayout(p)}
                className="flex items-center justify-between py-2.5 text-sm text-left w-full"
              >
                <div>
                  <p>{naira(p.netKobo)}</p>
                  <p className="text-[11px] text-ink-3">
                    {p.payoutAccount.bankName} ···{p.payoutAccount.accountNumber.slice(-4)}
                  </p>
                </div>
                <span className={`text-[11px] uppercase tracking-widest font-semibold ${statusMeta(p.status).className}`}>
                  {statusMeta(p.status).label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      </div>

      <PayoutDetailSheet payout={selectedPayout} onClose={() => setSelectedPayout(null)} />
    </div>
  );
}
