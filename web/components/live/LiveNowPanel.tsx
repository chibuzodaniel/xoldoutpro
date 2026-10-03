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

  useEffect(() => {
    apiFetch("/api/live")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setSessions(data.sessions);
        setUpcoming(data.upcoming ?? []);
      });
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
export function UpcomingSection({ upcoming }: { upcoming: UpcomingLiveCardData[] }) {
  if (upcoming.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="text-xl font-bold mb-3">Upcoming</h2>
      <div className="flex flex-col gap-2">
        {upcoming.map((live) => (
          <UpcomingLiveRow key={live.id} live={live} />
        ))}
      </div>
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
