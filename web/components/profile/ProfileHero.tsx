import { ClickablePhoto } from "@/components/profile/ClickablePhoto";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { ProfileBio } from "@/components/profile/ProfileBio";

// v2 profile header (user's reference screenshot, 2026-11-11): full-bleed
// cover, a red glass card over it with the round avatar on the left, name +
// badge, @handle, public link and bio on the right, then the stats row and
// the action buttons. Shared by /u/[handle] and the owner's /profile.

export type ProfileStat = { label: string; value: number | null };

export function ProfileHero({
  user,
  avatar,
  stats,
  actions,
  topBar,
  extra,
}: {
  user: { id: string; displayName: string; handle: string; coverUrl: string | null; bio: string | null; isVerified: boolean; verificationBadges: unknown };
  /** The avatar element (owner gets the change-photo badge). */
  avatar: React.ReactNode;
  stats: ProfileStat[];
  actions: React.ReactNode;
  topBar?: React.ReactNode;
  /** Under the bio inside the card: tags, location, Get Verified. */
  extra?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <ClickablePhoto targetUserId={user.id} kind="cover" photoUrl={user.coverUrl} alt="Cover photo" label="Cover photo" className="block w-full">
        <div
          className="h-48 bg-gradient-to-br from-red/60 via-red/20 to-black bg-cover bg-center sm:h-60 md:h-72"
          style={user.coverUrl ? { backgroundImage: `url(${user.coverUrl})` } : undefined}
        />
      </ClickablePhoto>
      <div className="pointer-events-none absolute inset-x-0 top-24 h-40 bg-gradient-to-b from-transparent to-bg sm:top-32 md:top-40" />
      {topBar}

      <div className="relative -mt-24 px-4 sm:-mt-28">
        <div className="mx-auto max-w-xl rounded-xl border border-white/15 bg-gradient-to-br from-red/45 via-[#3a0710]/80 to-[#1a0306]/90 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-5">
          <div className="flex items-start gap-4 sm:gap-5">
            {avatar}
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="flex items-center gap-2 text-[24px] font-extrabold uppercase leading-tight tracking-tight sm:text-[28px]">
                <span className="truncate">{user.displayName}</span>
                {user.isVerified && (
                  <VerifiedBadge className="h-5 w-5 shrink-0" badgeType={primaryBadgeType(user.verificationBadges as string[])} />
                )}
              </h1>
              <p className="mt-0.5 truncate text-[16px] text-white/75">@{user.handle}</p>
              <a href={`/u/${user.handle}`} className="mt-1.5 flex items-center gap-1.5 text-[14px] text-white/85">
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1 1M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1-1" strokeLinecap="round" />
                </svg>
                <span className="truncate">xoldout.app/u/{user.handle}</span>
              </a>
              {user.bio && <ProfileBio text={user.bio} />}
              {extra}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center text-[14px] text-white/75 sm:text-[15px]">
            {stats.map((s, i) => (
              <span key={s.label} className="flex items-center">
                {i > 0 && <span className="mx-3 h-4 w-px bg-white/35 sm:mx-5" aria-hidden />}
                <span className="whitespace-nowrap">
                  <b className="font-bold text-white">{s.value === null ? "—" : s.value.toLocaleString("en-NG")}</b> {s.label}
                </span>
              </span>
            ))}
          </div>

          <div className="mt-4">{actions}</div>
        </div>
      </div>
    </div>
  );
}
