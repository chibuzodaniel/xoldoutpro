"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { BottomSheet } from "@/components/live/BottomSheet";
import { GiftArt, XgCoin, type GiftArtType } from "@/components/live/LiveIcons";
import { giftByType } from "@/components/live/giftCatalog";

// The host's tappable "supporters" and "XG" chips on the broadcast page
// (explicit ask, 2026-10-04). Both read GET /api/live/[id]/support (lib/
// live/xgEarnings.ts's getLiveSupport) — complete from the database, not
// just what this page happened to see — and refresh whenever `version`
// bumps (the page bumps it on every gift while a sheet is open).

type Supporter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  giftsCount: number;
  giftsXg: number;
  accessXg: number;
  requestsCount: number;
  requestsXg: number;
  totalXg: number;
  kobo: number;
};

type SourceTotals = { xg: number; kobo: number; count: number };

export type LiveSupport = {
  totalXg: number;
  totalKobo: number;
  gifts: SourceTotals;
  access: SourceTotals;
  requests: SourceTotals;
  giftTypes: { type: string; count: number; xg: number }[];
  supporters: Supporter[];
};

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function xg(n: number) {
  return `${n.toLocaleString("en-NG")} XG`;
}

export function useLiveSupport(liveId: string, open: boolean, version: number) {
  const [data, setData] = useState<LiveSupport | null>(null);
  const load = useCallback(async () => {
    const res = await apiFetch(`/api/live/${liveId}/support`).catch(() => null);
    if (res?.ok) setData(await res.json());
  }, [liveId]);
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when opened or a new gift lands
    void load();
  }, [open, version, load]);
  return data;
}

function what(s: Supporter) {
  const parts: string[] = [];
  if (s.giftsCount > 0) parts.push(`${s.giftsCount} gift${s.giftsCount === 1 ? "" : "s"}`);
  if (s.accessXg > 0) parts.push("paid to join");
  if (s.requestsCount > 0) parts.push(`${s.requestsCount} request${s.requestsCount === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

export function SupportersSheet({ data, onClose }: { data: LiveSupport | null; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto pb-2">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-serif text-[24px] leading-tight">Supporters</h2>
          {data && <span className="text-sm text-ink-3">{data.supporters.length}</span>}
        </div>
        {!data ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : data.supporters.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">No one has sent XG yet. Gifts, paid joins and requests show up here.</p>
        ) : (
          <ol className="divide-y divide-white/10">
            {data.supporters.map((s, i) => (
              <li key={s.userId} className="flex items-center gap-3 py-2.5">
                <span className={`w-5 shrink-0 text-center text-[13px] font-bold ${i < 3 ? "text-amber" : "text-ink-3"}`}>{i + 1}</span>
                <FallbackImg
                  src={s.avatarUrl}
                  alt={s.displayName}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                  fallback={<InitialsAvatar name={s.displayName || "?"} className="h-10 w-10 text-[12px]" />}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">
                    {s.displayName}
                    {i === 0 && <span className="ml-1.5 text-[12px]">👑</span>}
                  </p>
                  <p className="truncate text-[12px] text-ink-3">
                    {s.handle && `@${s.handle} · `}
                    {what(s)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-semibold text-amber">{xg(s.totalXg)}</p>
                  <p className="text-[12px] text-ink-2">{naira(s.kobo)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </BottomSheet>
  );
}

function StatRow({ label, totals, unit }: { label: string; totals: SourceTotals; unit: string }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-[15px]">{label}</p>
        <p className="text-[12px] text-ink-3">
          {totals.count} {unit}
          {totals.count === 1 ? "" : "s"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-[14px] font-semibold text-amber">{xg(totals.xg)}</p>
        <p className="text-[12px] text-ink-2">{naira(totals.kobo)}</p>
      </div>
    </div>
  );
}

export function CoinStatsSheet({ data, onClose }: { data: LiveSupport | null; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto pb-2">
        <h2 className="mb-4 font-serif text-[24px] leading-tight">Coins received</h2>
        {!data ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <>
            <div className="mb-5 rounded-2xl border border-amber/30 bg-amber/5 px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[14px] text-ink-2">This stream</span>
                <span className="flex items-center gap-1.5 text-[22px] font-semibold text-amber">
                  <XgCoin className="h-6 w-6" />
                  {xg(data.totalXg)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[13px]">
                <span className="text-ink-3">
                  From {data.supporters.length} supporter{data.supporters.length === 1 ? "" : "s"}
                </span>
                <span className="font-serif text-lg">{naira(data.totalKobo)}</span>
              </div>
            </div>

            <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-3">By type</p>
            <div className="mb-5 divide-y divide-white/10">
              <StatRow label="Gifts" totals={data.gifts} unit="gift" />
              <StatRow label="Paid access" totals={data.access} unit="join" />
              <StatRow label="Paid requests" totals={data.requests} unit="request" />
            </div>

            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-ink-3">Gifts received</p>
            {data.giftTypes.length === 0 ? (
              <p className="text-sm text-ink-3">No gifts yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {data.giftTypes.map((g) => (
                  <div key={g.type} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5">
                    <GiftArt type={g.type as GiftArtType} className="h-9 w-9" />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold">
                        {giftByType(g.type)?.label ?? g.type} ×{g.count}
                      </p>
                      <p className="text-[12px] text-amber">{xg(g.xg)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
