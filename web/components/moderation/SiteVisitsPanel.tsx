"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Totals = { uniqueVisitors: number; pageViews: number };
type Period = "today" | "7d" | "30d" | "all";
type VisitDashboard = {
  totals: { today: Totals; week: Totals; month: Totals; allTime: Totals };
  daily: { day: string; uniqueVisitors: number; pageViews: number }[];
  byCountry: { country: string; uniqueVisitors: number; pageViews: number }[];
  countries: string[];
};

const PERIOD_TABS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

const regionNames = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

function countryName(code: string): string {
  if (code === "ZZ") return "Unknown";
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code) || code === "ZZ") return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function fmt(n: number) {
  return n.toLocaleString("en-NG");
}

function TotalsTile({ label, totals }: { label: string; totals: Totals }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[11px] uppercase tracking-widest text-ink-3">{label}</p>
      <p className="mt-1 font-serif text-2xl tabular-nums">{fmt(totals.uniqueVisitors)}</p>
      <p className="text-[11px] text-ink-3">visitors</p>
      <p className="mt-1 text-[13px] font-semibold tabular-nums text-ink-2">{fmt(totals.pageViews)}</p>
      <p className="text-[11px] text-ink-3">page views</p>
    </div>
  );
}

// Last 30 days, one bar per UTC day (unique visitors), zero-filled so
// quiet days still show as gaps. Same single-hue bar style as GrowthChart.
function DailyBars({ daily }: { daily: VisitDashboard["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (29 - i)));
    const key = d.toISOString().slice(0, 10);
    return { key, date: d, uniqueVisitors: byDay.get(key)?.uniqueVisitors ?? 0, pageViews: byDay.get(key)?.pageViews ?? 0 };
  });
  const max = Math.max(1, ...days.map((d) => d.uniqueVisitors));
  const shown = days[hover ?? days.length - 1];

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[12px] text-ink-3">Daily visitors · last 30 days</p>
        <p className="text-[12px] tabular-nums">
          <span className="text-ink-3">{shown.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: </span>
          <span className="font-semibold">{fmt(shown.uniqueVisitors)}</span>
          <span className="text-ink-3"> visitors · {fmt(shown.pageViews)} views</span>
        </p>
      </div>
      <div className="flex h-28 items-end gap-[3px]" onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          <div key={d.key} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
            <div
              className={`w-full rounded-t-sm transition-colors ${hover === i ? "bg-red-soft" : "bg-red"}`}
              style={{ height: `${Math.max(d.uniqueVisitors > 0 ? 4 : 1, (d.uniqueVisitors / max) * 100)}%`, opacity: d.uniqueVisitors > 0 ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// Explicit ask: total site visits — daily, weekly, monthly, all time —
// filterable by country. "Visits" = both unique visitors (hashed, no IPs
// stored — lib/analytics/visits.ts) and page views, side by side.
export function SiteVisitsPanel() {
  const [country, setCountry] = useState("");
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<VisitDashboard | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const qs = new URLSearchParams({ period });
      if (country) qs.set("country", country);
      const res = await apiFetch(`/api/admin/visits?${qs}`);
      if (cancelled) return;
      if (!res.ok) return setError(true);
      setError(false);
      setData(await res.json());
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [country, period]);

  const breakdownTotal = data?.byCountry.reduce((sum, c) => sum + c.uniqueVisitors, 0) ?? 0;

  return (
    <div className="rounded-lg border border-line-soft p-4 mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-widest text-ink-3">Site visits</p>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-red"
          aria-label="Filter by country"
        >
          <option value="">All countries</option>
          {data?.countries.map((c) => (
            <option key={c} value={c}>
              {countryFlag(c)} {countryName(c)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="text-xs text-red-soft">Could not load visits.</p>
      ) : data === null ? (
        <p className="text-xs text-ink-3">Loading…</p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TotalsTile label="Today" totals={data.totals.today} />
            <TotalsTile label="This week" totals={data.totals.week} />
            <TotalsTile label="This month" totals={data.totals.month} />
            <TotalsTile label="All time" totals={data.totals.allTime} />
          </div>

          <DailyBars daily={data.daily} />

          {!country && (
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] text-ink-3">By country</p>
                <div className="flex gap-1">
                  {PERIOD_TABS.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setPeriod(t.value)}
                      className={`rounded-full px-2.5 py-1 text-[12px] ${period === t.value ? "bg-red text-white" : "text-ink-3 hover:text-ink-2"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {data.byCountry.length === 0 ? (
                <p className="text-xs text-ink-3">No visits in this period yet.</p>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-widest text-ink-3">
                      <th className="py-1.5 font-normal">Country</th>
                      <th className="py-1.5 text-right font-normal">Visitors</th>
                      <th className="py-1.5 text-right font-normal">Views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCountry.map((c) => (
                      <tr
                        key={c.country}
                        onClick={() => setCountry(c.country)}
                        className="cursor-pointer border-t border-line-soft hover:bg-white/[0.03]"
                      >
                        <td className="py-2">
                          <span className="mr-2">{countryFlag(c.country)}</span>
                          {countryName(c.country)}
                          <span className="ml-2 text-[11px] text-ink-3">
                            {breakdownTotal > 0 ? Math.round((c.uniqueVisitors / breakdownTotal) * 100) : 0}%
                          </span>
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">{fmt(c.uniqueVisitors)}</td>
                        <td className="py-2 text-right tabular-nums text-ink-2">{fmt(c.pageViews)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
