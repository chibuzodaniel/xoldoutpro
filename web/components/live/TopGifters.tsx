"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { InitialsAvatar } from "@/components/live/LiveCard";
import { BottomSheet } from "@/components/live/BottomSheet";
import { XgCoin } from "@/components/live/LiveIcons";

// The viewer-facing gift leaderboard (explicit ask, 2026-10-04: "the live
// viewer should see the top gifter"): a crowned chip under the header, and
// the top 5 when tapped. Gift XG only — see lib/live/xgEarnings.ts's
// getTopGifters. Refetched whenever `version` bumps (each gift).

export type TopGifter = {
  userId: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  xg: number;
  giftsCount: number;
};

export function useTopGifters(liveId: string, enabled: boolean, version: number) {
  const [gifters, setGifters] = useState<TopGifter[]>([]);
  const load = useCallback(async () => {
    const res = await apiFetch(`/api/live/${liveId}/top-gifters`).catch(() => null);
    if (res?.ok) setGifters((await res.json()).gifters);
  }, [liveId]);
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refetch when connected and after each gift
    void load();
  }, [enabled, version, load]);
  return gifters;
}

function Avatar({ g, className }: { g: TopGifter; className: string }) {
  return (
    <FallbackImg
      src={g.avatarUrl}
      alt={g.displayName}
      className={`${className} shrink-0 rounded-full object-cover`}
      fallback={<InitialsAvatar name={g.displayName || "?"} className={`${className} text-[10px]`} />}
    />
  );
}

export function TopGifterChip({ top, selfId, onOpen }: { top: TopGifter | undefined; selfId: string | null; onOpen: () => void }) {
  if (!top) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="See the top gifters"
      className="flex max-w-[75%] items-center gap-1.5 rounded-full border border-amber/40 bg-black/50 py-0.5 pl-0.5 pr-3 backdrop-blur-sm"
    >
      <Avatar g={top} className="h-6 w-6" />
      <span className="text-[12px]" aria-hidden>
        👑
      </span>
      <span className="truncate text-[13px] font-semibold text-white">{top.userId === selfId ? "You" : top.displayName}</span>
      <span className="shrink-0 text-[12px] font-semibold text-amber">{top.xg.toLocaleString("en-NG")} XG</span>
    </button>
  );
}

export function TopGiftersSheet({ gifters, selfId, onClose }: { gifters: TopGifter[]; selfId: string | null; onClose: () => void }) {
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="mb-4 font-serif text-[24px] leading-tight">Top gifters</h2>
      {gifters.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">No gifts yet — be the first.</p>
      ) : (
        <ol className="divide-y divide-white/10">
          {gifters.map((g, i) => (
            <li key={g.userId} className={`flex items-center gap-3 py-2.5 ${g.userId === selfId ? "rounded-xl bg-amber/10 px-2" : ""}`}>
              <span className={`w-5 shrink-0 text-center text-[14px] font-bold ${i === 0 ? "text-amber" : "text-ink-3"}`}>
                {i === 0 ? "👑" : i + 1}
              </span>
              <Avatar g={g} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{g.userId === selfId ? "You" : g.displayName}</p>
                <p className="truncate text-[12px] text-ink-3">
                  {g.handle && `@${g.handle} · `}
                  {g.giftsCount} gift{g.giftsCount === 1 ? "" : "s"}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-amber">
                <XgCoin className="h-4 w-4" />
                {g.xg.toLocaleString("en-NG")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </BottomSheet>
  );
}
