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

// Bachs documents no delivery SLA for a payout — showing a countdown to a
// promised time we don't actually have would just be a lie that stalls at
// 0:00 if the bank takes longer. Elapsed time is the one thing about this
// that's always true, so that's what ticks — paired with a live poll so the
// sheet updates in place the moment the real status actually changes,
// instead of the visitor having to close and reopen it to find out.
function ElapsedTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSec = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(elapsedSec / 3600);
  const m = Math.floor((elapsedSec % 3600) / 60);
  const s = elapsedSec % 60;
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;

  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface p-4 mb-5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber" />
      </span>
      <span className="font-mono text-sm text-ink-2">Processing for {label}</span>
    </div>
  );
}

function PayoutDetailSheet({
  payout,
  onClose,
  onRefresh,
}: {
  payout: Payout | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const status = payout ? statusMeta(payout.status) : null;

  // Polls while this specific sheet is open on a still-in-flight payout —
  // stops the moment it closes or the status leaves PROCESSING, so this
  // never runs as a background drain on/off the wallet page.
  useEffect(() => {
    if (!payout || payout.status !== "PROCESSING") return;
    const id = setInterval(onRefresh, 10_000);
    return () => clearInterval(id);
  }, [payout, onRefresh]);

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
              <>
                <ElapsedTimer since={payout.createdAt} />
                <p className="text-xs text-ink-3 mb-5 -mt-3">
                  Usually a few minutes to a few hours — this updates on its own once it&apos;s sent.
                </p>
              </>
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

const HISTORY_PAGE_SIZE = 5;
const STATUS_TAB_ORDER = ["PROCESSING", "PAID", "FAILED", "PENDING"];

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [selectedPayoutId, setSelectedPayoutId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [historyExpanded, setHistoryExpanded] = useState(false);

  function selectStatusFilter(status: string) {
    setStatusFilter(status);
    setHistoryExpanded(false); // switching tabs re-collapses back to the first 5, same as opening the page fresh
  }

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/wallet");
      if (res.ok) setData(await res.json());
    }
    load();
  }, []);

  // Re-derived from `data` on every render rather than kept as its own
  // snapshot — see the polling effect in PayoutDetailSheet below, which
  // needs this object to actually change (not just the sheet's open/closed
  // state) once a background refresh picks up a status change.
  const selectedPayout = data?.payouts.find((p) => p.id === selectedPayoutId) ?? null;

  async function refreshWallet() {
    const res = await apiFetch("/api/wallet");
    if (res.ok) setData(await res.json());
  }

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
          <>
            {(() => {
              const presentStatuses = STATUS_TAB_ORDER.filter((s) => data.payouts.some((p) => p.status === s));
              const tabs = ["ALL", ...presentStatuses];
              // A status the current filter points at can disappear entirely
              // (e.g. the only FAILED payout gets refunded/reclassified) —
              // fall back to ALL rather than showing an empty tab forever.
              const activeFilter = tabs.includes(statusFilter) ? statusFilter : "ALL";
              const filtered = activeFilter === "ALL" ? data.payouts : data.payouts.filter((p) => p.status === activeFilter);
              const visible = historyExpanded ? filtered : filtered.slice(0, HISTORY_PAGE_SIZE);
              const hiddenCount = filtered.length - visible.length;

              return (
                <>
                  {tabs.length > 1 && (
                    <div className="flex items-center gap-2 mb-3 overflow-x-auto">
                      {tabs.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => selectStatusFilter(t)}
                          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                            activeFilter === t
                              ? "border-red text-red-soft bg-red/10"
                              : "border-line text-ink-2 hover:border-line-strong hover:text-ink"
                          }`}
                        >
                          {t === "ALL" ? "All" : statusMeta(t).label}
                        </button>
                      ))}
                    </div>
                  )}

                  {filtered.length === 0 ? (
                    <p className="text-sm text-ink-3">Nothing here.</p>
                  ) : (
                    <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
                      {visible.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPayoutId(p.id)}
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

                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded(true)}
                      className="mt-3 w-full text-center text-xs font-semibold text-red-soft"
                    >
                      Show {hiddenCount} more
                    </button>
                  )}
                  {historyExpanded && filtered.length > HISTORY_PAGE_SIZE && (
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded(false)}
                      className="mt-3 w-full text-center text-xs font-semibold text-ink-3"
                    >
                      Show less
                    </button>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
      </div>

      <PayoutDetailSheet payout={selectedPayout} onClose={() => setSelectedPayoutId(null)} onRefresh={refreshWallet} />
    </div>
  );
}
