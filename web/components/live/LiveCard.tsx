import Link from "next/link";
import { FallbackImg } from "@/components/ui/FallbackImg";
import { EyeIcon } from "@/components/live/LiveIcons";

export type LiveCardSession = {
  id: string;
  title: string;
  isPaidAccess: boolean;
  isBattle?: boolean;
  priceXg: number;
  viewerCount: number;
  creator: { displayName: string; avatarUrl: string | null };
};

// The mockup's card backdrops — a saturated wash per card (purple, rust,
// teal, wine) rather than AVATAR_GRADIENTS' all-red palette, so a row of
// Live cards reads as distinct streams at a glance.
const LIVE_CARD_GRADIENTS = [
  "from-[#5b1f8f] via-[#3a1460] to-[#140a1f]",
  "from-[#8f3a1f] via-[#5c2312] to-[#1f0d08]",
  "from-[#1f6b6b] via-[#124545] to-[#081a1a]",
  "from-[#7d1430] via-[#4d0c1e] to-[#1f050c]",
];

// Muted solid fills for the initials avatars (Live cards, chat rows) —
// deterministic per name so the same person keeps the same color everywhere.
const INITIALS_COLORS = ["#4f7a3a", "#7a3a5c", "#3a5c7a", "#7a5c3a", "#5c3a7a", "#3a7a6b", "#7a3a3a", "#6b6b3a"];

// The mockup's convention: the first two letters of the name, not first +
// last initial ("Amara Voss" → AM, "chi_chi" → CH, "DJ Kelechi" → DJ).
export function initialsOf(name: string): string {
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "");
  return (letters || "?").slice(0, 2).toUpperCase();
}

export function initialsColorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

export function InitialsAvatar({ name, className = "h-6 w-6 text-[10px]" }: { name: string; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border border-white/25 font-bold text-white ${className}`}
      style={{ backgroundColor: initialsColorFor(name) }}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}

export function LiveCard({ session, index }: { session: LiveCardSession; index: number }) {
  const gradient = LIVE_CARD_GRADIENTS[index % LIVE_CARD_GRADIENTS.length];
  return (
    <Link href={`/live/${session.id}`} className="block group">
      <div className={`relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-gradient-to-b ${gradient}`}>
        <span className="absolute left-2.5 top-2.5 rounded-md bg-red px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
          Live
        </span>
        {session.isBattle && (
          <span className="absolute left-2.5 top-8 rounded-md bg-amber px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-black">⚔️ Battle</span>
        )}
        <span className="absolute right-2.5 top-2.5 rounded-full bg-black/45 backdrop-blur-sm px-2.5 py-1 text-[11px] font-semibold text-white flex items-center gap-1">
          <EyeIcon className="h-3.5 w-3.5" />
          {session.viewerCount.toLocaleString("en-NG")}
        </span>
        <div className="absolute inset-x-0 bottom-0 p-3 pt-10 bg-gradient-to-t from-black/75 to-transparent">
          <div className="flex items-center gap-2">
            <FallbackImg
              src={session.creator.avatarUrl}
              alt={session.creator.displayName}
              className="h-8 w-8 rounded-full object-cover shrink-0 border border-white/25"
              fallback={<InitialsAvatar name={session.creator.displayName} className="h-8 w-8 text-[11px]" />}
            />
            <span className="text-[14px] font-semibold text-white truncate">{session.creator.displayName}</span>
          </div>
          {session.isPaidAccess && <p className="mt-1.5 text-[11px] font-semibold text-amber">{session.priceXg} XG to join</p>}
        </div>
      </div>
    </Link>
  );
}

export type UpcomingLiveCardData = {
  id: string;
  title: string;
  scheduledFor: string | Date | null;
  isPaidAccess: boolean;
  isBattle?: boolean;
  priceXg: number;
  reminderCount: number;
  creator: { displayName: string; avatarUrl: string | null };
};

/** A row on the "Upcoming" rail — opens the Live's own link (countdown, Remind me, Share). */
export function UpcomingLiveRow({ live }: { live: UpcomingLiveCardData }) {
  const when = live.scheduledFor ? new Date(live.scheduledFor) : null;
  return (
    <Link href={`/live/${live.id}`} className="flex items-center gap-3 rounded-2xl border border-line-soft bg-surface px-3 py-3 transition-colors hover:bg-surface-2">
      <FallbackImg
        src={live.creator.avatarUrl}
        alt={live.creator.displayName}
        className="h-11 w-11 shrink-0 rounded-full object-cover border border-white/15"
        fallback={<InitialsAvatar name={live.creator.displayName} className="h-11 w-11 text-[13px]" />}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">
          {live.isBattle && <span className="mr-1.5 rounded bg-amber px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-black">⚔️ Battle</span>}
          {live.title}
        </p>
        <p className="truncate text-[12px] text-ink-3" suppressHydrationWarning>
          {live.creator.displayName}
          {when && ` · ${when.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
        </p>
      </div>
      <span className="shrink-0 text-right text-[11px] text-ink-3">
        {live.isPaidAccess ? <span className="block font-semibold text-amber">{live.priceXg} XG</span> : null}
        🔔 {live.reminderCount}
      </span>
    </Link>
  );
}
