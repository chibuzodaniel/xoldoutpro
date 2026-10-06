"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { LiveCard, UpcomingLiveRow, type LiveCardSession, type UpcomingLiveCardData } from "@/components/live/LiveCard";
import { BroadcastIcon, ShieldIcon, XgCoin } from "@/components/live/LiveIcons";

// The "Live now" list + Go Live entry point + lifetime gift earnings —
// client-side counterpart of app/(app)/live/page.tsx's server-rendered
// version, for embedding in Socials' own "Go Live" tab (the mockup's second
// entry point, alongside Discover's nav row) without refactoring that
// working server component.
export function LiveNowPanel() {
  const { firebaseUser } = useAuth();
  const [sessions, setSessions] = useState<LiveCardSession[] | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingLiveCardData[]>([]);
  const [earningsXg, setEarningsXg] = useState<number | null>(null);

  // Loaded on mount, then every 20s while the tab is visible and again
  // whenever it becomes visible — it used to load once, so a Live that
  // started after the tab was opened never appeared.
  useEffect(() => {
    const load = () =>
      apiFetch("/api/live")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          setSessions(data.sessions);
          setUpcoming(data.upcoming ?? []);
        })
        .catch(() => {});
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const id = setInterval(refresh, 45_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser) return;
    apiFetch("/api/live/earnings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setEarningsXg(data.giftsXg));
  }, [firebaseUser]);

  if (sessions === null) {
    return <LoadingSpinner full size="md" />;
  }

  return (
    <div>
      <GoLiveButton />
      <p className="flex items-center gap-1.5 text-[12px] text-ink-3 mt-2.5 mb-4">
        <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
        Lives aren&apos;t saved. Only stats and gift records are kept.
      </p>

      {earningsXg !== null && (
        <Link href="/live/coins" className="flex items-center justify-between py-1 mb-6">
          <span className="flex items-center gap-2.5 text-[15px] text-ink">
            <XgCoin className="h-6 w-6" />
            Earnings from gifts
          </span>
          <span className="text-[15px] font-semibold text-amber">{earningsXg.toLocaleString("en-NG")} XG ›</span>
        </Link>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-bold">Live now</h2>
        {sessions.length > 0 && (
          <span className="text-sm text-ink-3">
            {sessions.length} artist{sessions.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-ink-3">Nobody&apos;s live right now.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {sessions.map((session, i) => (
            <LiveCard key={session.id} session={session} index={i} />
          ))}
        </div>
      )}

      <UpcomingSection upcoming={upcoming} />
    </div>
  );
}

/** Scheduled Lives, soonest first — shared with app/(app)/live/page.tsx. */
// Collapsed by default, with a search once opened (explicit ask,
// 2026-10-04: "the lives that start in … should be collapsed and can be
// searched instead of having everything open"). Matches artist name or
// Live title; the list is already soonest-first from the server.
export function UpcomingSection({ upcoming }: { upcoming: UpcomingLiveCardData[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  if (upcoming.length === 0) return null;

  const q = query.trim().toLowerCase();
  const matches = q
    ? upcoming.filter((l) => l.title.toLowerCase().includes(q) || l.creator.displayName.toLowerCase().includes(q))
    : upcoming;
  const next = upcoming[0];

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-line-soft bg-surface px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <p className="text-xl font-bold">
            Upcoming <span className="text-base font-medium text-ink-3">· {upcoming.length}</span>
          </p>
          {!open && (
            <p className="truncate text-[12px] text-ink-3">
              Next: {next.creator.displayName} — {next.title}
            </p>
          )}
        </div>
        <svg
          viewBox="0 0 24 24"
          className={`h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-3">
          {upcoming.length > 1 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search upcoming Lives by artist or title"
              className="mb-3 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-red"
            />
          )}
          {matches.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-3">No upcoming Lives match &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {matches.map((live) => (
                <UpcomingLiveRow key={live.id} live={live} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The mockup's dark pill with a soft red under-glow — shared with
// app/(app)/live/page.tsx so both entry points look identical.
export function GoLiveButton() {
  return (
    <Link
      href="/live/new"
      className="flex items-center justify-center gap-2.5 rounded-2xl border border-white/5 bg-[#141416] px-4 py-4 text-[16px] font-medium text-white shadow-[0_6px_28px_-6px_rgba(225,29,46,0.55)] transition-colors hover:bg-[#1a1a1d]"
    >
      <BroadcastIcon className="h-5 w-5" />
      Go Live
    </Link>
  );
}
