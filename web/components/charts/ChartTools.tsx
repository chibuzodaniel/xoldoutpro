"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { chartFilterGroups, type ChartFilterKey } from "@/lib/charts/filters";

// "See all" chart tools (v2, design/v2-prototype): a search toggle for the
// header, and the "N ranked · period" row with the Filter button + sheet.
// Everything lives in the URL, so the server renders the filtered chart.

function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${pathname}?${next}`, { scroll: false });
    },
    [router, pathname, sp],
  );
}

export function ChartSearch() {
  const sp = useSearchParams();
  const update = useUpdateParams();
  const [open, setOpen] = useState(Boolean(sp.get("q")));
  const [q, setQ] = useState(sp.get("q") ?? "");
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => update({ q: q.trim() || null }), 400);
    return () => clearTimeout(t);
  }, [q, update]);

  return open ? (
    <div className="mt-4 flex items-center gap-2">
      <label className="flex flex-1 items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-3">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this chart by title or creator" aria-label="Search charts" className="w-full bg-transparent text-[15px] outline-none placeholder:text-ink-3" />
      </label>
      <button
        type="button"
        onClick={() => {
          setQ("");
          setOpen(false);
          update({ q: null });
        }}
        className="shrink-0 text-sm font-semibold"
      >
        Cancel
      </button>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} aria-label="Search charts" className="absolute right-4 top-7 flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:text-ink md:right-6">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-4.3-4.3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export function ChartFilterBar({ chart, count, periodLabel }: { chart: string; count: number; periodLabel: string }) {
  const sp = useSearchParams();
  const update = useUpdateParams();
  const groups = chartFilterGroups(chart);
  const current = Object.fromEntries(groups.map((g) => [g.key, sp.get(g.key)])) as Record<ChartFilterKey, string | null>;
  const active = groups.filter((g) => current[g.key]).length;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <div className="mt-5 flex items-center justify-between">
        <p className="text-[14px] text-ink-3">
          {count} ranked · {periodLabel}
          {sp.get("q") ? ` · “${sp.get("q")}”` : ""}
        </p>
        {groups.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setDraft(current);
              setOpen(true);
            }}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-bold ${active ? "border-red text-red-soft" : "border-line"}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" strokeLinecap="round" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
            Filter{active ? ` (${active})` : ""}
          </button>
        )}
      </div>

      <BottomSheet
        open={open}
        onClose={close}
        title="Filter chart"
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDraft(Object.fromEntries(groups.map((g) => [g.key, null])) as Record<ChartFilterKey, string | null>)}
              className="rounded-full border border-line px-6 py-3.5 font-bold"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => {
                update(Object.fromEntries(groups.map((g) => [g.key, draft[g.key]])));
                setOpen(false);
              }}
              className="flex-1 rounded-full bg-red px-6 py-3.5 font-bold text-white"
            >
              Show results
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 px-5 pb-4">
          {groups.map((g) => (
            <div key={g.key}>
              <p className="mb-2 text-[13px] text-ink-3">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {[{ value: null as string | null, label: "Any" }, ...g.options].map((o) => {
                  const on = (draft[g.key] ?? null) === o.value;
                  return (
                    <button
                      key={o.value ?? "any"}
                      type="button"
                      onClick={() => setDraft({ ...draft, [g.key]: o.value })}
                      className={`rounded-full px-4 py-2 text-[14px] font-semibold ${on ? "bg-red text-white" : "border border-line bg-surface text-ink-2"}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
