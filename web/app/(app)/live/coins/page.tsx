"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BackHeader } from "@/components/ui/BackHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { AddBalance } from "@/components/live/AddBalance";
import { XgCoin } from "@/components/live/LiveIcons";

export default function LiveCoinsPage() {
  const [balanceXg, setBalanceXg] = useState<number | null>(null);

  useEffect(() => {
    apiFetch("/api/coins")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setBalanceXg(data.balanceXg));
  }, []);

  return (
    <div className="pb-10">
      <BackHeader title="XG balance" />
      <div className="px-4">
        <div className="mb-8 flex items-center justify-between rounded-2xl border border-line-soft bg-surface px-5 py-4">
          <span className="text-[14px] text-ink-2">Your balance</span>
          <span className="flex items-center gap-2 text-[20px] font-semibold text-amber">
            <XgCoin className="h-6 w-6" />
            {balanceXg === null ? <LoadingSpinner size="sm" /> : `${balanceXg.toLocaleString("en-NG")} XG`}
          </span>
        </div>

        <AddBalance />
        <p className="mt-2 pl-[22px] text-[12px] text-ink-3">XG can&apos;t be redeemed for cash.</p>
      </div>
    </div>
  );
}
