"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { XgCoin } from "@/components/live/LiveIcons";

// Creator side of the XG balance page (explicit asks, 2026-10-04): XG received
// on Live waits here at the rate in force when it arrived and converts to
// the wallet on the 1st of each month; below it, every Live's own stats,
// who gifted (top gifter first), and the Naira value next to every XG
// figure. See lib/live/xgEarnings.ts. Hidden entirely for anyone who has
// never gone live or received XG — most viewers only ever see the top-up half.

type Gifter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  giftsCount: number;
  xg: number;
  kobo: number;
};

type LiveStats = {
  id: string;
  title: string;
  status: "LIVE" | "ENDED";
  startedAt: string;
  endedAt: string | null;
  peakViewers: number;
  giftsCount: number;
  giftsXg: number;
  giftsKobo: number;
  accessCount: number;
  accessXg: number;
  accessKobo: number;
  requestsCount: number;
  requestsXg: number;
  requestsKobo: number;
  totalXg: number;
  earnedKobo: number;
  gifters: Gifter[];
};

type EarningsData = {
  balanceXg: number;
  balanceKobo: number;
  nextPayoutAt: string;
  rateKobo: number;
  lives: LiveStats[];
  topGifter: Gifter | null;
  conversions: { id: string; amountKobo: number; xg: number; createdAt: string }[];
};

const GIFTERS_COLLAPSED = 3;

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

function GifterAvatar({ gifter, size }: { gifter: Gifter; size: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (gifter.avatarUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={gifter.avatarUrl} alt="" style={style} className="shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />;
  }
  return (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-red/20 text-[12px] font-semibold text-red-soft">
      {(gifter.displayName.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

function Stat({ label, value, naira: nairaValue, sub }: { label: string; value: string; naira?: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-bg px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-widest text-ink-3">{label}</p>
      <p className="text-[13px] font-semibold">{value}</p>
      {nairaValue && <p className="text-[12px] text-ink-2">{nairaValue}</p>}
      {sub && <p className="text-[11px] text-ink-3">{sub}</p>}
    </div>
  );
}

function GifterRow({ gifter, rank, isTop }: { gifter: Gifter; rank: number; isTop: boolean }) {
  return (
    <Link href={gifter.handle ? `/u/${gifter.handle}` : "#"} className="flex items-center gap-2.5 py-2">
      <span className="w-4 shrink-0 text-center text-[12px] text-ink-3">{rank}</span>
      <GifterAvatar gifter={gifter} size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold">
          {gifter.displayName}
          {isTop && <span className="ml-1.5 rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber">👑 Top gifter</span>}
        </p>
        <p className="text-[11px] text-ink-3">
          {gifter.handle && `@${gifter.handle} · `}
          {gifter.giftsCount} {gifter.giftsCount === 1 ? "gift" : "gifts"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-semibold text-amber">{xg(gifter.xg)}</p>
        <p className="text-[12px] text-ink-2">{naira(gifter.kobo)}</p>
      </div>
    </Link>
  );
}

function LiveCard({ live }: { live: LiveStats }) {
  const [showAll, setShowAll] = useState(false);
  const gifters = showAll ? live.gifters : live.gifters.slice(0, GIFTERS_COLLAPSED);

  return (
    <div className="rounded-xl border border-line-soft bg-surface p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{live.title}</p>
          <p className="text-[12px] text-ink-3">
            {formatDate(live.startedAt)} · {duration(live.startedAt, live.endedAt)} · {live.peakViewers.toLocaleString("en-NG")} peak viewers
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[14px] font-semibold text-amber">{xg(live.totalXg)}</p>
          <p className="text-[12px] text-ink-2">{naira(live.earnedKobo)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Gifts" value={xg(live.giftsXg)} naira={naira(live.giftsKobo)} sub={`${live.giftsCount} sent`} />
        <Stat label="Paid access" value={xg(live.accessXg)} naira={naira(live.accessKobo)} sub={`${live.accessCount} joined`} />
        <Stat label="Requests" value={xg(live.requestsXg)} naira={naira(live.requestsKobo)} sub={`${live.requestsCount} sent`} />
      </div>

      {live.gifters.length > 0 && (
        <div className="mt-3 border-t border-line-soft pt-2">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-ink-3">Who gifted</p>
          <div className="flex flex-col divide-y divide-line-soft">
            {gifters.map((g, i) => (
              <GifterRow key={g.userId} gifter={g} rank={i + 1} isTop={i === 0} />
            ))}
          </div>
          {live.gifters.length > GIFTERS_COLLAPSED && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-[12px] font-semibold text-ink-2">
              {showAll ? "Show less" : `Show all ${live.gifters.length} gifters`}
            </button>
          )}
        </div>
      )}
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

  const totals = data.lives.reduce((t, l) => ({ xg: t.xg + l.totalXg, kobo: t.kobo + l.earnedKobo }), { xg: 0, kobo: 0 });

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
            <Stat label="XG received" value={totals.xg.toLocaleString("en-NG")} naira={naira(totals.kobo)} />
            <Stat label="Gifters" value={new Set(data.lives.flatMap((l) => l.gifters.map((g) => g.userId))).size.toLocaleString("en-NG")} />
          </div>

          {data.topGifter && (
            <div className="mb-4 rounded-xl border border-amber/30 bg-amber/5 px-3">
              <p className="pt-2.5 text-[10px] uppercase tracking-widest text-amber">Your top gifter</p>
              <GifterRow gifter={data.topGifter} rank={1} isTop={false} />
            </div>
          )}

          <div className="mb-8 flex flex-col gap-3">
            {data.lives.map((l) => (
              <LiveCard key={l.id} live={l} />
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
