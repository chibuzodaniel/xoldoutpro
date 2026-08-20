"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type ProductStat = {
  id: string;
  title: string;
  type: "RELEASE" | "BEAT" | "EVENT" | "MERCH";
  cap: number | null;
  sold: number;
  soldOutAt: string | null;
  sellThroughPct: number | null;
  timeToSellOutHours: number | null;
};

type AnalyticsData = {
  totals: {
    unitsSold: number;
    fans: number;
    newFans30d: number;
    totalCustomers: number;
    returningCustomers: number;
    sellOutRatePct: number | null;
  };
  topProducts: ProductStat[];
};

const TYPE_LABEL: Record<ProductStat["type"], string> = { RELEASE: "Music", BEAT: "Beat", EVENT: "Event", MERCH: "Merch" };

function formatDuration(hours: number) {
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem ? `${days}d ${rem}h` : `${days}d`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    apiFetch("/api/analytics")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData);
  }, []);

  if (data === null) return <LoadingSpinner full size="lg" />;

  const { totals, topProducts } = data;
  const returningPct = totals.totalCustomers > 0 ? Math.round((totals.returningCustomers / totals.totalCustomers) * 100) : null;

  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-1">Analytics</h1>
      <p className="text-xs text-ink-3 mb-6">How your work is performing. No money here — see Wallet for that.</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
          <p className="font-serif text-2xl">{totals.unitsSold}</p>
          <p className="text-[11px] uppercase tracking-widest text-ink-3 mt-0.5">Units sold</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
          <p className="font-serif text-2xl">{totals.fans}</p>
          <p className="text-[11px] uppercase tracking-widest text-ink-3 mt-0.5">Fans</p>
          {totals.newFans30d > 0 && <p className="text-[11px] text-red-soft mt-0.5">+{totals.newFans30d} in 30d</p>}
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
          <p className="font-serif text-2xl">{totals.sellOutRatePct !== null ? `${totals.sellOutRatePct}%` : "—"}</p>
          <p className="text-[11px] uppercase tracking-widest text-ink-3 mt-0.5">Sell-out rate</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
          <p className="font-serif text-2xl">{returningPct !== null ? `${returningPct}%` : "—"}</p>
          <p className="text-[11px] uppercase tracking-widest text-ink-3 mt-0.5">Returning fans</p>
          {totals.totalCustomers > 0 && (
            <p className="text-[11px] text-ink-3 mt-0.5">
              {totals.returningCustomers} of {totals.totalCustomers}
            </p>
          )}
        </div>
      </div>

      <h2 className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-1">Top products</h2>
      {topProducts.length === 0 ? (
        <p className="text-sm text-ink-3 mb-6">Nothing published yet.</p>
      ) : (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-6">
          {topProducts.map((p) => (
            <div key={p.id} className="py-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold line-clamp-1">{p.title}</p>
                  <p className="text-[11px] uppercase tracking-widest text-ink-3">{TYPE_LABEL[p.type]}</p>
                </div>
                <span className="font-serif text-lg shrink-0 ml-3">{p.sold}</span>
              </div>
              {(p.sellThroughPct !== null || p.timeToSellOutHours !== null) && (
                <p className="text-xs text-ink-3 mt-1">
                  {p.sellThroughPct !== null && (
                    <>
                      Sell-through {p.sellThroughPct}% ({p.sold}/{p.cap})
                    </>
                  )}
                  {p.sellThroughPct !== null && p.timeToSellOutHours !== null && " · "}
                  {p.timeToSellOutHours !== null && <>Sold out in {formatDuration(p.timeToSellOutHours)}</>}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
