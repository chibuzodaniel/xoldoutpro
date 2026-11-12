"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileAvatar, ProfileCardActions, ProfileTopBar } from "@/components/profile/ProfileHeaderRow";
import { ReportSheet } from "@/components/trust/ReportSheet";
import { useInstallGuide } from "@/components/pwa/InstallGuideProvider";
import { SalesMilestoneSheet } from "@/components/profile/SalesMilestoneSheet";
import { PlanCapNudgeSheet } from "@/components/plans/PlanCapNudgeSheet";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { ContactXoldout } from "@/components/support/ContactXoldout";
import { ProfileMetaLine } from "@/components/profile/ProfileMetaLine";
import { ProfileLinkBadges, ProfileLinkList } from "@/components/profile/ProfileLinks";

const FEEDBACK_REASONS = [
  { value: "BUG" as const, label: "Something's broken" },
  { value: "FEATURE_REQUEST" as const, label: "Feature request" },
];

type Stats = {
  fans: number;
  subscribers?: number;
  sales: number;
  catalog: { music: number; beats: number; events: number; merch: number };
  pendingFanbaseRequests: number;
  pendingCollaborations?: number;
};

const CATALOG = [
  { key: "music", label: "Music releases", href: "/profile/catalog", icon: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M9 18V5l11-2v13" strokeLinejoin="round" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" />
    </svg>
  ) },
  { key: "beats", label: "Beats & packs", href: "/profile/catalog/beats", icon: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M6 5v14M12 5v14M18 5v14" strokeLinecap="round" />
    </svg>
  ) },
  { key: "events", label: "Events", href: "/profile/catalog/events", icon: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="7" width="18" height="10" rx="2" /><path d="M8 7v10M16 7v10" />
    </svg>
  ) },
  { key: "merch", label: "Merchandise", href: "/profile/catalog/merch", icon: (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 9h14l-1 11H6L5 9z" strokeLinejoin="round" /><path d="M9 9V7a3 3 0 016 0v2" />
    </svg>
  ) },
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
  music: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M9 18V5l12-2v13" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
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
      {/* v2 own profile (user's reference, 2026-11-11): same card as the
          public profile (bio included), with Edit profile + Share. */}
      <ProfileHero
        user={appUser}
        location={(appUser as unknown as { profileLocation?: string | null }).profileLocation ?? null}
        topBar={<ProfileTopBar handle={appUser.handle} displayName={appUser.displayName} showBack={false} />}
        avatar={<ProfileAvatar targetUserId={appUser.id} avatarUrl={appUser.avatarUrl} displayName={appUser.displayName} shape="round" />}
        stats={[
          { label: "Followers", value: stats ? stats.fans : null },
          { label: "Sales", value: stats ? stats.sales : null },
          { label: "Subscribers", value: stats ? (stats.subscribers ?? 0) : null },
        ]}
        actions={<ProfileCardActions targetUserId={appUser.id} handle={appUser.handle} displayName={appUser.displayName} />}
        extra={
          <ProfileMetaLine location={(appUser as unknown as { profileLocation?: string | null }).profileLocation ?? null} tags={appUser.tags}>
            <Link href="/profile/edit" aria-label="Edit tags" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-dashed border-white/40 text-[12px] text-white/70">
              +
            </Link>
            {!appUser.isVerified && (
              <Link href="/verification" className="flex shrink-0 animate-pulse items-center gap-1 rounded-full border border-white/40 bg-white/10 px-2 py-px text-[11px] font-semibold text-white">
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                Get Verified
              </Link>
            )}
          </ProfileMetaLine>
        }
      />

      <div className="mt-2 flex justify-center px-4">
        <ProfileLinkBadges links={appUser.socialLinks} />
      </div>

      <div className="px-4 md:px-6">
        {/* Preview first, then the XOLDOUT channel card (explicit ask, 2026-11-12). */}
        <Link href={publicPath} className="mt-4 flex items-center gap-3 rounded-2xl border border-red/30 bg-red/10 px-4 py-3">
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-black ring-1 ring-red">
            {/* eslint-disable-next-line @next/next/no-img-element -- small avatar */}
            {appUser.avatarUrl && <img src={appUser.avatarUrl} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">Preview public profile</span>
            <span className="block truncate text-[12px] text-ink-2">See your profile as visitors do · xoldout.app{publicPath}</span>
          </span>
          <span className="shrink-0 rounded-full bg-red px-4 py-2 text-[13px] font-bold text-white">Open</span>
        </Link>
        <ContactXoldout className="mt-3" />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Tile icon={I.wallet} title="Wallet" sub="Earnings and payouts" href="/wallet" />
          <Tile icon={I.insights} title="Insights" sub="Views, sales, growth" href="/analytics" />
          <Tile icon={I.settings} title="Settings" sub="Account and security" href="/profile/edit" />
          <Tile icon={I.music} title="Subscription" sub="Catalog subscription for fans" href="/profile/subscription" />
          <Tile icon={I.settings} title="Sections" sub="Choose what visitors see" href="/profile/sections" />
          <Tile
            icon={I.collab}
            title="Collaborations"
            sub={pendingCollabs ? `${pendingCollabs} pending` : "Features and royalty splits"}
            href="/profile/collaborations"
            alert={pendingCollabs > 0}
          />
          <Tile icon={I.music} title="Invitations" sub="Perform at events: accept or decline" href="/profile/invitations" />
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
          <Tile icon={I.chat} title="Send feedback" sub="XOLDOUT channel: issues and ideas" href="/support" />
        </div>

        <section className="mt-8 md:max-w-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.18em] text-ink-2">Your catalog</h2>
            <Link href="/publish" className="text-sm font-semibold text-red-soft">
              + Drop
            </Link>
          </div>
          {/* Catalog list (user's reference, 2026-11-11): icon, name, count. */}
          <div className="mt-3 border-t border-white/10">
            {CATALOG.map((c) => (
              <Link key={c.key} href={c.href} className="flex items-center gap-4 border-b border-white/10 py-4 text-ink transition-colors duration-150 hover:bg-white/[0.03]">
                <span className="w-6 text-ink-2">{c.icon}</span>
                <span className="flex-1 text-[17px]">{c.label}</span>
                <span className="font-serif text-[18px] text-ink-2">{stats?.catalog[c.key] ?? 0}</span>
              </Link>
            ))}
          </div>
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
