"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { XgCoin } from "@/components/live/LiveIcons";

// Creator side of the XG balance page (explicit ask, 2026-10-04): XG received
// on Live waits here at the rate in force when it arrived, converts to the
// wallet on the 1st of each month, and every Live's own stats are listed
// below it. See lib/live/xgEarnings.ts. Hidden entirely for anyone who has
// never gone live or received XG — most viewers only ever see the top-up half.

type LiveStats = {
  id: string;
  title: string;
  status: "LIVE" | "ENDED";
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  giftsCount: number;
  giftsXg: number;
  accessCount: number;
  accessXg: number;
  requestsCount: number;
  requestsXg: number;
  totalXg: number;
  earnedKobo: number;
};

type EarningsData = {
  balanceXg: number;
  balanceKobo: number;
  nextPayoutAt: string;
  rateKobo: number;
  lives: LiveStats[];
  conversions: { id: string; amountKobo: number; xg: number; createdAt: string }[];
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function xg(n: number) {
  return `${n.toLocaleString("en-NG")} XG`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });
}

function duration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "Live now";
  const mins = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-bg px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-widest text-ink-3">{label}</p>
      <p className="text-[13px] font-semibold">{value}</p>
      {sub && <p className="text-[11px] text-ink-3">{sub}</p>}
    </div>
  );
}

export function EarnedXgSection() {
  const [data, setData] = useState<EarningsData | null | undefined>(undefined);

  useEffect(() => {
    apiFetch("/api/live/earnings")
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (data === undefined) {
    return (
      <div className="mt-10 flex justify-center">
        <LoadingSpinner size="sm" />
      </div>
    );
  }
  if (!data || (data.lives.length === 0 && data.balanceXg === 0 && data.conversions.length === 0)) return null;

  const totals = data.lives.reduce(
    (t, l) => ({ xg: t.xg + l.totalXg, kobo: t.kobo + l.earnedKobo, viewers: Math.max(t.viewers, l.peakViewers) }),
    { xg: 0, kobo: 0, viewers: 0 },
  );

  return (
    <div className="mt-10">
      <h2 className="mb-3 text-[12px] uppercase tracking-widest text-ink-3">Your Live earnings</h2>

      <div className="mb-2 rounded-2xl border border-line-soft bg-surface px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-ink-2">Earned XG</span>
          <span className="flex items-center gap-2 text-[20px] font-semibold text-amber">
            <XgCoin className="h-6 w-6" />
            {xg(data.balanceXg)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[13px]">
          <span className="text-ink-3">Worth</span>
          <span className="font-serif text-lg">{naira(data.balanceKobo)}</span>
        </div>
      </div>
      <p className="mb-6 text-[12px] text-ink-3">
        Paid into your wallet on {formatDate(data.nextPayoutAt)}, then withdrawable as usual. You earn{" "}
        {naira(data.rateKobo)} per XG received.
      </p>

      {data.lives.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Stat label="Lives" value={data.lives.length.toLocaleString("en-NG")} />
            <Stat label="XG received" value={totals.xg.toLocaleString("en-NG")} />
            <Stat label="Earned" value={naira(totals.kobo)} />
          </div>

          <div className="mb-8 flex flex-col gap-3">
            {data.lives.map((l) => (
              <div key={l.id} className="rounded-xl border border-line-soft bg-surface p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{l.title}</p>
                    <p className="text-[12px] text-ink-3">
                      {formatDate(l.startedAt)} · {duration(l.startedAt, l.endedAt)} · {l.peakViewers.toLocaleString("en-NG")} peak viewers
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-semibold text-amber">{xg(l.totalXg)}</p>
                    <p className="text-[12px] text-ink-2">{naira(l.earnedKobo)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Gifts" value={xg(l.giftsXg)} sub={`${l.giftsCount} sent`} />
                  <Stat label="Paid access" value={xg(l.accessXg)} sub={`${l.accessCount} joined`} />
                  <Stat label="Requests" value={xg(l.requestsXg)} sub={`${l.requestsCount} sent`} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {data.conversions.length > 0 && (
        <>
          <h2 className="mb-3 text-[12px] uppercase tracking-widest text-ink-3">Monthly payouts to wallet</h2>
          <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft">
            {data.conversions.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  {formatDate(c.createdAt)} <span className="text-ink-3">· {xg(c.xg)}</span>
                </span>
                <span className="font-serif">{naira(c.amountKobo)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
