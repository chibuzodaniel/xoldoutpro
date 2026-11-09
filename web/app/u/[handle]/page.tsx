import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ProfileAvatar, ProfileActions } from "@/components/profile/ProfileHeaderRow";
import { ProfileLinkBadges, ProfileLinkList } from "@/components/profile/ProfileLinks";
import { ClickablePhoto } from "@/components/profile/ClickablePhoto";
import { OwnedBadgesProvider } from "@/components/product/OwnedBadges";
import { ReportButton } from "@/components/trust/ReportButton";
import { VerifiedBadge, primaryBadgeType } from "@/components/profile/VerifiedBadge";
import { buildOgMetadata } from "@/lib/og";
import { NewVisitorGate } from "@/components/auth/NewVisitorGate";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";
import { withFeedExtras } from "@/lib/discover/feed";
import { ProfileShowcase } from "@/components/profile/ProfileShowcase";


// Public, non-personalized profile data — cache and serve from the CDN,
// revalidating in the background rather than hitting the DB on every view.
export const revalidate = 300;


export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle }, select: { displayName: true, bio: true, avatarUrl: true } });
  if (!user) return {};
  return buildOgMetadata({
    title: `${user.displayName} (@${handle}) on XOLDOUT`,
    description: user.bio || `Check out ${user.displayName}'s catalog on XOLDOUT.`,
    imageUrl: user.avatarUrl,
    path: `/u/${handle}`,
  });
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const user = await db.user.findUnique({ where: { handle } });
  if (!user) notFound();

  const [catalog, events, fansCount, salesAgg, featuredOn] = await Promise.all([
    db.product.findMany({
      where: { creatorId: user.id, type: { in: ["RELEASE", "BEAT", "MERCH"] }, status: "PUBLISHED" },
      include: {
        creator: { select: { handle: true, displayName: true } },
        release: { select: { artworkLadder: true, releaseType: true } },
        beat: { select: { coverImageLadder: true } },
        merchItem: { select: { imageLadder: true } },
        stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } },
      },
      orderBy: { publishedAt: "desc" },
    }),
    // Events are their own model (one Product per ticket tier, not one per
    // event — DECISIONS.md), so they never come back from the Product query
    // above and need their own fetch, same shape as Discover's.
    db.event.findMany({
      where: { creatorId: user.id, status: "PUBLISHED" },
      include: { tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } } },
      orderBy: { startsAt: "asc" },
    }),
    db.follow.count({ where: { followedId: user.id } }),
    db.stockPolicy.aggregate({ where: { product: { creatorId: user.id } }, _sum: { sold: true } }),
    // Releases this artist is officially featured on (accepted tags only).
    db.product.findMany({
      where: { type: "RELEASE", status: "PUBLISHED", collaborators: { some: { artistId: user.id, status: "ACCEPTED" } } },
      include: discoverCardInclude,
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
  ]);

  // First track of each song (for the play buttons), one query for the page.
  const [withTracks, featuredWithTracks] = await Promise.all([withFeedExtras(catalog.filter((p) => p.type !== "MERCH")), withFeedExtras(featuredOn)]);

  const socialLinks = (user.socialLinks as { platform: string; url: string }[] | null) ?? [];

  return (
    <div className="pb-8">
      <NewVisitorGate />
      {/* v2 public profile (design/v2-prototype, 2026-11-09): big cover,
          centred square avatar, name / handle / public link, stats, bio,
          link badges, actions, Links, then "On XOLDOUT". */}
      <div className="relative">
        <ClickablePhoto targetUserId={user.id} kind="cover" photoUrl={user.coverUrl} alt="Cover photo" label="Cover photo" className="block w-full">
          <div
            className="h-56 bg-gradient-to-br from-red/40 via-surface-2 to-black bg-cover bg-center md:h-72"
            style={user.coverUrl ? { backgroundImage: `url(${user.coverUrl})` } : undefined}
          />
        </ClickablePhoto>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="-mt-20 flex flex-col items-center px-4 text-center">
        <ProfileAvatar targetUserId={user.id} avatarUrl={user.avatarUrl} displayName={user.displayName} />
        <h1 className="mt-4 flex items-center justify-center gap-2 text-[32px] font-extrabold leading-tight">
          {user.displayName}
          {user.isVerified && <VerifiedBadge className="h-6 w-6 shrink-0" badgeType={primaryBadgeType(user.verificationBadges)} />}
        </h1>
        <p className="text-[17px] text-ink-2">@{user.handle}</p>
        <p className="text-[12px] text-ink-3">xoldout.app/u/{user.handle}</p>
        <p className="mt-3 text-[15px] text-ink-2">
          {fansCount.toLocaleString("en-NG")} Followers <span className="px-1.5 text-ink-3">•</span> {(salesAgg._sum.sold ?? 0).toLocaleString("en-NG")} Sales
        </p>
        {user.bio && <p className="mt-3 max-w-md text-[16px] italic text-ink-2">{user.bio}</p>}
        {user.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {user.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-4">
          <ProfileLinkBadges links={socialLinks} />
        </div>
        <div className="mx-auto mt-5 w-full max-w-md">
          <ProfileActions targetUserId={user.id} handle={user.handle} displayName={user.displayName} />
        </div>
        <ReportButton targetType="PROFILE" targetId={user.id} className="mt-3 text-xs text-ink-3" />
      </div>

      <div className="px-4 md:px-6">
        <ProfileLinkList links={socialLinks} />

        <OwnedBadgesProvider productIds={[...catalog, ...featuredOn].map((p) => p.id)}>
          <ProfileShowcase
            songs={withTracks.filter((p) => p.type === "RELEASE")}
            beats={withTracks.filter((p) => p.type === "BEAT")}
            merch={catalog.filter((p) => p.type === "MERCH")}
            featuredOn={featuredWithTracks}
            events={events.map((ev) => ({
              id: ev.id,
              creatorId: ev.creatorId,
              title: ev.title,
              coverImageLadder: ev.coverImageLadder,
              startsAt: ev.startsAt,
              tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
            }))}
          />
        </OwnedBadgesProvider>
      </div>
    </div>
  );
}
