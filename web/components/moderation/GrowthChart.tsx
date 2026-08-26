"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Bucket = { label: string; count: number };
type Granularity = "day" | "week" | "month" | "year";
type Growth = Record<Granularity, Bucket[]>;

const TABS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];

const PERIOD_NOUN: Record<Granularity, string> = { day: "day", week: "week", month: "month", year: "year" };

// New-signups bar chart with a Day/Week/Month/Year toggle and a signed,
// colored delta vs the previous period (explicit ask: "use colors and signs
// to show which one is going up and down"). Bars, not a line — each bucket
// is a discrete period count (magnitude across ordered categories), not a
// continuous measurement. Single series, one hue (--red, this app's own
// brand accent — no reason to introduce an unrelated "chart color"); up/down
// uses --green/--red, the one pairing in this app's palette that actually
// passes the dataviz skill's CVD validator for a 2-color status pair
// (green + red-soft failed the lightness-band check).
export function GrowthChart() {
  const [growth, setGrowth] = useState<Growth | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      const res = await apiFetch("/api/admin/stats");
      if (!res.ok) return;
      const data = await res.json();
      setGrowth(data.growth);
    }
    load();
  }, []);

  if (growth === null) {
    return (
      <div className="rounded-lg border border-line-soft p-4 mb-6">
        <p className="text-xs text-ink-3">Loading…</p>
      </div>
    );
  }

  const buckets = growth[granularity];
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const currentIndex = buckets.length - 1;
  const current = buckets[currentIndex];
  const previous = buckets[currentIndex - 1];
  const delta = current && previous ? current.count - previous.count : null;
  const deltaPct = delta !== null && previous.count > 0 ? Math.round((delta / previous.count) * 100) : null;

  const shown = hoverIndex !== null ? buckets[hoverIndex] : current;
  const showingCurrent = hoverIndex === null || hoverIndex === currentIndex;

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3">New signups</p>
        <div className="flex gap-0.5 rounded-full bg-surface-2 p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setGranularity(tab.value);
                setHoverIndex(null);
              }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-150 ${
                granularity === tab.value ? "bg-red text-white" : "text-ink-3"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {buckets.length === 0 || max === 0 ? (
        <p className="text-xs text-ink-3">No signups yet.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-4">
            <p className="font-serif text-2xl tabular-nums">{shown?.count ?? 0}</p>
            <p className="text-xs text-ink-3">{shown ? shown.label : ""}</p>
            {showingCurrent && delta !== null && (
              <span
                className={`flex items-center gap-0.5 text-xs font-semibold ${delta >= 0 ? "text-green" : "text-red"}`}
                aria-label={`${delta >= 0 ? "up" : "down"} ${Math.abs(delta)} vs previous ${PERIOD_NOUN[granularity]}`}
              >
                <span aria-hidden="true">{delta >= 0 ? "▲" : "▼"}</span>
                {Math.abs(delta)}
                {deltaPct !== null && <span className="text-ink-3 font-normal">({deltaPct >= 0 ? "+" : ""}{deltaPct}%)</span>}
              </span>
            )}
          </div>

          <div className="flex items-end gap-1 h-24" onMouseLeave={() => setHoverIndex(null)}>
            {buckets.map((b, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHoverIndex(i)}
                onFocus={() => setHoverIndex(i)}
                onBlur={() => setHoverIndex(null)}
                className="flex-1 max-w-6 h-full flex items-end outline-none"
                aria-label={`${b.label}: ${b.count} new user${b.count === 1 ? "" : "s"}`}
              >
                <span
                  className="w-full rounded-t-[4px] transition-colors duration-150"
                  style={{
                    height: `${Math.max(3, (b.count / max) * 100)}%`,
                    backgroundColor: hoverIndex === i ? "var(--red-soft)" : "var(--red)",
                  }}
                />
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-ink-3">{buckets[0]?.label}</span>
            <span className="text-[10px] text-ink-3">{buckets[buckets.length - 1]?.label}</span>
          </div>
        </>
      )}
    </div>
  );
}
