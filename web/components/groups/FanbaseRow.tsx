import Link from "next/link";
import { AVATAR_GRADIENTS } from "@/lib/avatarGradients";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";

export type FanbaseRowData = {
  id: string;
  name: string;
  visibility: "OPEN" | "REQUEST_TO_JOIN";
  memberCount: number;
  lastActivityAt: string | null;
  joinRequestPending: boolean;
  creator: { displayName: string; isVerified?: boolean };
};

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Round avatar + lock badge + name + subtext + right-aligned action —
// matches the Fanbase list reference exactly (not a card grid: this is the
// one list surface in the app that's deliberately rows, not tiles, because
// that's what the reference shows).
export function FanbaseRow({
  group,
  index,
  subtitle,
  action,
}: {
  group: FanbaseRowData;
  index: number;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <Link href={`/groups/${group.id}`} className="relative shrink-0">
        <div
          className={`h-12 w-12 rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]} flex items-center justify-center text-sm font-semibold text-white/90`}
        >
          {group.name.slice(0, 1).toUpperCase()}
        </div>
        {group.visibility === "REQUEST_TO_JOIN" && (
          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-surface border border-line-soft flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2.4">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 118 0v3" />
            </svg>
          </span>
        )}
      </Link>
      <Link href={`/groups/${group.id}`} className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-semibold">
          <span className="line-clamp-1">{group.name}</span>
          {group.creator.isVerified && <VerifiedBadge />}
        </p>
        <p className="text-xs text-ink-3 line-clamp-1">{subtitle}</p>
      </Link>
      {action}
    </div>
  );
}

export { timeAgo };
