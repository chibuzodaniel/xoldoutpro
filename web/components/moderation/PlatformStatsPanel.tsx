"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PlatformStats = {
  totalUsers: number;
  activeUsers: number;
  deletedUsers: number;
  newUsers24h: number;
  newUsers7d: number;
  newUsers30d: number;
  totalModerators: number;
  totalCreators: number;
};

export function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 text-center">
      <p className="font-serif text-2xl">{value}</p>
      <p className="text-[11px] uppercase tracking-widest text-ink-3 mt-0.5">{label}</p>
    </div>
  );
}

// Explicit ask: "track of users and how the platform is growing" — a KPI
// row of stat tiles for the headline numbers, plus GrowthChart (see that
// component) for the actual day/week/month/year trend with a signed,
// colored delta. The creator-facing /api/analytics deliberately stayed
// stat-tiles-only ("the PRD requires the metrics, not a visualization") —
// this is the different, later ask the dataviz skill was flagged for then.
export function PlatformStatsPanel() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/admin/stats");
      if (!res.ok) return;
      setStats(await res.json());
    }
    load();
  }, []);

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3 mb-3">Platform growth</p>
      {stats === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <StatTile label="Total users" value={stats.totalUsers} />
            <StatTile label="Creators" value={stats.totalCreators} />
            <StatTile label="Moderators" value={stats.totalModerators} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="New today" value={stats.newUsers24h} />
            <StatTile label="New this week" value={stats.newUsers7d} />
            <StatTile label="New this month" value={stats.newUsers30d} />
          </div>
          {stats.deletedUsers > 0 && (
            <p className="text-[11px] text-ink-3 mt-2">
              {stats.activeUsers} active · {stats.deletedUsers} deleted (within recovery window or beyond)
            </p>
          )}
        </>
      )}
    </div>
  );
}
