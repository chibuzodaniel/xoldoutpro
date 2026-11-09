"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShareButton } from "@/components/ui/ShareButton";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { ClickablePhoto } from "@/components/profile/ClickablePhoto";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { ReportSheet } from "@/components/trust/ReportSheet";
import { useInstallGuide } from "@/components/pwa/InstallGuideProvider";
import { SalesMilestoneSheet } from "@/components/profile/SalesMilestoneSheet";
import { PlanCapNudgeSheet } from "@/components/plans/PlanCapNudgeSheet";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ProfileLinkBadges, ProfileLinkList } from "@/components/profile/ProfileLinks";

const FEEDBACK_REASONS = [
  { value: "BUG" as const, label: "Something's broken" },
  { value: "FEATURE_REQUEST" as const, label: "Feature request" },
];

type Stats = {
  fans: number;
  sales: number;
  catalog: { music: number; beats: number; events: number; merch: number };
  pendingFanbaseRequests: number;
  pendingCollaborations?: number;
};

const CATALOG = [
  { key: "music", label: "Music", href: "/profile/catalog" },
  { key: "beats", label: "Beats", href: "/profile/catalog/beats" },
  { key: "events", label: "Events", href: "/profile/catalog/events" },
  { key: "merch", label: "Merch", href: "/profile/catalog/merch" },
] as const;

const I = {
  wallet: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  insights: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.2a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.2a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.2a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1h.2a2 2 0 110 4h-.2a1.6 1.6 0 00-1.5 1z" />
    </svg>
  ),
  collab: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <circle cx="8.5" cy="8" r="3.5" />
      <circle cx="16.5" cy="9" r="3" />
      <path d="M2.5 20c.8-3.6 3.2-5.5 6-5.5s5.2 1.9 6 5.5M14.5 14.6c.6-.1 1.3-.1 2 0 2.6.3 4.4 2.1 5 5.4" strokeLinecap="round" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 118 0v3" />
    </svg>
  ),
  ambassador: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a6 6 0 016-6h4a6 6 0 016 6v2" />
    </svg>
  ),
  billboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <rect x="3" y="5" width="18" height="12" rx="1.5" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2" strokeLinecap="round" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M21 11.5a8.5 8.5 0 01-8.5 8.5c-1.2 0-2.3-.25-3.3-.7L4 20l.9-4.5A8.5 8.5 0 1121 11.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

// One owner tile (design/v2-prototype's Wallet / Insights / Settings grid).
function Tile({ icon, title, sub, href, onClick, alert }: { icon: React.ReactNode; title: string; sub: string; href?: string; onClick?: () => void; alert?: boolean }) {
  const body = (
    <>
      <span className="text-red-soft">{icon}</span>
      <span className="mt-3 block text-[17px] font-bold">{title}</span>
      <span className={`mt-0.5 block text-[13px] leading-snug ${alert ? "font-semibold text-red-soft" : "text-ink-3"}`}>{sub}</span>
    </>
  );
  const cls = "block rounded-2xl border border-line bg-surface p-4 text-left";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

// v2 own profile (design/v2-prototype, 2026-11-09): big cover, centred
// square avatar, name/handle/public link, stats, bio, link badges, Edit /
// Share, owner tiles, catalog, links. Every control from the previous layout
// is still here (cover/avatar upload, Get Verified, requests, Ambassador,
// Billboards, Moderation, install, feedback) — only the arrangement changed.
export default function ProfilePage() {
  const { appUser } = useAuth();
  const installGuide = useInstallGuide();
  const [stats, setStats] = useState<Stats | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!appUser) return;
    apiFetch("/api/me/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats);
  }, [appUser]);

  if (!appUser) return <LoadingSpinner full size="lg" />;

  const publicPath = `/u/${appUser.handle}`;
  const pendingCollabs = stats?.pendingCollaborations ?? 0;
  const pendingFanbase = stats?.pendingFanbaseRequests ?? 0;

  return (
    <div className="pb-10">
      <div className="relative">
        <ClickablePhoto targetUserId={appUser.id} kind="cover" photoUrl={appUser.coverUrl} alt="Cover photo" label="Cover photo" className="block w-full">
          <div
            className="h-56 bg-gradient-to-br from-red/40 via-surface-2 to-black bg-cover bg-center"
            style={appUser.coverUrl ? { backgroundImage: `url(${appUser.coverUrl})` } : undefined}
          />
        </ClickablePhoto>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="-mt-20 flex flex-col items-center px-4 text-center">
        <ClickablePhoto targetUserId={appUser.id} kind="avatar" photoUrl={appUser.avatarUrl} alt={appUser.displayName} label="Profile photo" className="relative block">
          <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-[28px] border-[3px] border-white bg-surface-2">
            {appUser.avatarUrl ? (
              <Image src={appUser.avatarUrl} alt={appUser.displayName} fill sizes="128px" className="object-cover" />
            ) : (
              <span className="font-serif text-4xl text-ink-3">{appUser.displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg bg-red">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 stroke-white" fill="none" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          </span>
        </ClickablePhoto>

        <h1 className="mt-4 flex items-center justify-center gap-2 text-[32px] font-extrabold leading-tight">
          {appUser.displayName}
          {appUser.isVerified && <VerifiedBadge className="h-6 w-6 shrink-0" badgeType={primaryBadgeType(appUser.verificationBadges)} />}
        </h1>
        <p className="text-[17px] text-ink-2">@{appUser.handle}</p>
        <Link href={publicPath} className="text-[12px] text-ink-3">
          xoldout.app{publicPath}
        </Link>
        {!appUser.isVerified && (
          <Link
            href="/verification"
            className="mt-3 inline-flex animate-pulse items-center gap-1 rounded-full border border-red/40 bg-red/10 px-3 py-1 text-[12px] font-semibold text-red-soft"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            Get Verified
          </Link>
        )}

        <p className="mt-3 text-[15px] text-ink-2">
          {stats ? stats.fans.toLocaleString("en-NG") : "—"} Followers <span className="px-1.5 text-ink-3">•</span> {stats ? stats.sales.toLocaleString("en-NG") : "—"} Sales
        </p>

        {appUser.bio && <p className="mt-3 max-w-md text-[16px] italic text-ink-2">{appUser.bio}</p>}

        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {appUser.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
              {tag}
            </span>
          ))}
          <Link href="/profile/edit" aria-label="Edit tags" className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line text-ink-3">
            +
          </Link>
        </div>

        <div className="mt-4">
          <ProfileLinkBadges links={appUser.socialLinks} />
        </div>
      </div>

      <div className="px-4">
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link href="/profile/edit" className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-3.5 text-[15px] font-bold text-black">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M4 20l.9-4.5L16.6 3.8a1.6 1.6 0 012.3 0l1.3 1.3a1.6 1.6 0 010 2.3L8.5 19.1 4 20z" strokeLinejoin="round" />
            </svg>
            Edit profile
          </Link>
          <ShareButton
            title={`${appUser.displayName} on XOLDOUT`}
            text={`Follow me on XOLDOUT — @${appUser.handle}`}
            path={publicPath}
            label="Share profile"
            className="w-full justify-center border border-line bg-transparent px-4 py-3.5 text-[15px] font-bold text-ink"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <Tile icon={I.wallet} title="Wallet" sub="Earnings and payouts" href="/wallet" />
          <Tile icon={I.insights} title="Insights" sub="Views, sales, growth" href="/analytics" />
          <Tile icon={I.settings} title="Settings" sub="Account and security" href="/profile/edit" />
          <Tile
            icon={I.collab}
            title="Collaborations"
            sub={pendingCollabs ? `${pendingCollabs} pending` : "Features and royalty splits"}
            href="/profile/collaborations"
            alert={pendingCollabs > 0}
          />
          <Tile
            icon={I.lock}
            title="Fanbase requests"
            sub={pendingFanbase ? `${pendingFanbase} pending` : "Nothing pending"}
            href="/groups/requests"
            alert={pendingFanbase > 0}
          />
          <Tile
            icon={I.ambassador}
            title={appUser.isAmbassador ? "Ambassador" : "Become an Ambassador"}
            sub={appUser.isAmbassador ? "Referral link and earnings" : "Earn by inviting fans"}
            href="/ambassador"
          />
          <Tile icon={I.billboard} title="Billboards" sub="Get on the Discover rotation" href="/billboards" />
          {appUser.isModerator && <Tile icon={I.shield} title="Moderation" sub="Review queue" href="/moderation" />}
          <Tile icon={I.download} title="Install app" sub="Add XOLDOUT to your phone" onClick={installGuide.open} />
          <Tile icon={I.chat} title="Send feedback" sub="Report a bug or idea" onClick={() => setFeedbackOpen(true)} />
        </div>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-serif text-2xl font-bold">Your catalog</h2>
            <Link href="/publish" className="text-sm font-semibold text-red-soft">
              + Drop
            </Link>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {CATALOG.map((c) => (
              <Link key={c.key} href={c.href} className="rounded-2xl border border-line bg-surface px-2 py-3 text-center">
                <span className="block font-serif text-2xl font-bold">{stats?.catalog[c.key] ?? 0}</span>
                <span className="block text-[12px] text-ink-3">{c.label}</span>
              </Link>
            ))}
          </div>
          <Link href={publicPath} className="mt-3 block rounded-full border border-line px-4 py-3.5 text-center text-[15px] font-bold">
            Preview public profile
          </Link>
        </section>

        <ProfileLinkList links={appUser.socialLinks} manageHref="/profile/links" />
      </div>

      <ReportSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        targetType="PROFILE"
        targetId={appUser.id}
        reasons={FEEDBACK_REASONS}
        title="Send feedback"
        detailsPlaceholder="What's broken, or what would you like to see?"
      />
      <SalesMilestoneSheet />
      <PlanCapNudgeSheet />
    </div>
  );
}
