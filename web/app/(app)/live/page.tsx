import Link from "next/link";
import { listLiveSessionsNow, listUpcomingLiveSessions } from "@/lib/live/sessions";
import { BackHeader } from "@/components/ui/BackHeader";
import { LiveCard } from "@/components/live/LiveCard";
import { GoLiveButton, UpcomingSection } from "@/components/live/LiveNowPanel";
import { ShieldIcon } from "@/components/live/LiveIcons";
import { AutoRefresh } from "@/components/live/AutoRefresh";

// Explicit ask: web can go live too, not just mobile — app/(app)/live/new
// and app/(app)/live/[id]/broadcast/page.tsx do the getUserMedia capture,
// same shape as mobile's @livekit/react-native screens, sharing the same
// API routes and the same "chat"/"live-event" data-channel protocol either
// way, so a Live works the same regardless of which side started it.
//
// Always rendered fresh (explicit report, 2026-10-04: "sometimes Live now
// doesn't show the Lives that are active"). It used to be ISR-cached with
// revalidate = 30, and on Vercel the first visit after that window still got
// the old copy while a new one built — on a quiet site, minutes stale.
// AutoRefresh below keeps an open page current too.
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const [sessions, upcoming] = await Promise.all([listLiveSessionsNow(), listUpcomingLiveSessions()]);

  return (
    <div className="pb-10">
      <AutoRefresh intervalMs={60_000} />
      <BackHeader
        title="Live"
        action={
          <Link href="/live/coins" className="text-xs text-amber font-semibold shrink-0">
            XG balance
          </Link>
        }
      />
      <div className="px-4">
        <GoLiveButton />
        <p className="flex items-center gap-1.5 text-[12px] text-ink-3 mt-2.5 mb-6">
          <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
          Lives aren&apos;t saved. Only stats and gift records are kept.
        </p>

        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xl font-bold">Live now</h2>
          {sessions.length > 0 && (
            <span className="text-sm text-ink-3">
              {sessions.length} artist{sessions.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-ink-3 py-8 text-center">Nobody&apos;s live right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sessions.map((session, i) => (
              <LiveCard key={session.id} session={session} index={i} />
            ))}
          </div>
        )}

        <UpcomingSection upcoming={upcoming} />
      </div>
    </div>
  );
}
