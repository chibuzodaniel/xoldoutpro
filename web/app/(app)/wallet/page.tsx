"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BackHeader } from "@/components/ui/BackHeader";

type WalletData = {
  availableKobo: number;
  pendingKobo: number;
  totalEarnedKobo: number;
  totalWithdrawnKobo: number;
  earnedByCategory: Record<string, number>;
  payouts: {
    id: string;
    amountKobo: number;
    netKobo: number;
    status: string;
    createdAt: string;
    payoutAccount: { bankName: string; accountNumber: string };
  }[];
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);

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

      <div className="rounded-xl border border-line bg-surface p-4 mb-3">
        <p className="text-[11px] uppercase tracking-widest text-ink-3">Available</p>
        <p className="font-serif text-3xl">{naira(data.availableKobo)}</p>
      </div>

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

      <p className="text-[12px] text-ink-3 mb-6">
        Pending becomes available 7 days after a sale, matching the refund window. Once it&apos;s available, it&apos;s
        yours to withdraw.
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
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p>{naira(p.netKobo)}</p>
                  <p className="text-[11px] text-ink-3">
                    {p.payoutAccount.bankName} ···{p.payoutAccount.accountNumber.slice(-4)}
                  </p>
                </div>
                <span className="text-[11px] uppercase tracking-widest text-ink-3">{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
