import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ProfileAvatar, ProfileCardActions, ProfileTopBar } from "@/components/profile/ProfileHeaderRow";
import { ProfileHero } from "@/components/profile/ProfileHero";
import { ProfileLinkBadges, ProfileLinkList } from "@/components/profile/ProfileLinks";
import { OwnedBadgesProvider } from "@/components/product/OwnedBadges";
import { ReportButton } from "@/components/trust/ReportButton";
import { buildOgMetadata } from "@/lib/og";
import { NewVisitorGate } from "@/components/auth/NewVisitorGate";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";
import { withFeedExtras } from "@/lib/discover/feed";
import { ProfileShowcase } from "@/components/profile/ProfileShowcase";
import { CatalogSubscriptionCard } from "@/components/subscriptions/CatalogSubscriptionCard";
import { readSections } from "@/lib/profile/sections";
import { LINEUP_ROLE_LABEL } from "@/lib/event/lineupRules";
import { ProfileMetaLine } from "@/components/profile/ProfileMetaLine";
import { FallbackImg } from "@/components/ui/FallbackImg";


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

  // Profile sections (v2): what the owner chose to show visitors.
  const sections = readSections(user.profileSections);
  const [catalog, events, fansCount, salesAgg, featuredOn, subscriptionPlans, subscriberCount, publicPostCount, libraryItems] = await Promise.all([
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
    // Hosted events, plus ones this artist accepted to perform at (2026-11-11 — no separate section).
    db.event.findMany({
      where: { status: "PUBLISHED", OR: [{ creatorId: user.id }, { lineup: { some: { userId: user.id, status: "ACCEPTED" } } }] },
      include: {
        tiers: { select: { product: { select: { priceKobo: true, stockPolicy: true } } } },
        lineup: { where: { userId: user.id, status: "ACCEPTED" }, select: { role: true } },
      },
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
    // Catalog subscription (v2): plans and active subscribers, only when offered.
    user.catalogSubscriptionOn
      ? db.subscriptionPlan.findMany({
          where: { creatorId: user.id },
          select: { durationDays: true, priceKobo: true },
          orderBy: { durationDays: "asc" },
        })
      : Promise.resolve([]),
    user.catalogSubscriptionOn
      ? db.catalogSubscription.count({ where: { creatorId: user.id, currentPeriodEnd: { gt: new Date() } } })
      : Promise.resolve(0),
    // Posts and activity: public (Everyone) posts only — this page doesn't know who's viewing.
    sections.posts
      ? db.post.count({ where: { authorId: user.id, groupId: null, repostOfId: null, audience: "EVERYONE" } })
      : Promise.resolve(0),
    // Music library: songs they've bought — only when they turned it on.
    sections.library
      ? db.entitlement.findMany({
          where: { userId: user.id, revokedAt: null, product: { type: "RELEASE", status: "PUBLISHED" } },
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            product: {
              select: { id: true, title: true, creator: { select: { displayName: true } }, release: { select: { artworkLadder: true } } },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // First track of each song (for the play buttons), one query for the page.
  const [withTracks, featuredWithTracks] = await Promise.all([withFeedExtras(catalog.filter((p) => p.type !== "MERCH")), withFeedExtras(featuredOn)]);

  const socialLinks = (user.socialLinks as { platform: string; url: string }[] | null) ?? [];

  return (
    <div className="pb-8">
      <NewVisitorGate />
      {/* v2 public profile (user's reference, 2026-11-11): cover with a red
          glass card (avatar, name, handle, link, bio, stats, Follow / Tip /
          Message), social icons, catalog subscription, Report, "On XOLDOUT",
          then the music-platform Links. */}
      <ProfileHero
        user={user}
        location={sections.location ? user.profileLocation : null}
        topBar={<ProfileTopBar handle={user.handle} displayName={user.displayName} />}
        avatar={<ProfileAvatar targetUserId={user.id} avatarUrl={user.avatarUrl} displayName={user.displayName} shape="round" />}
        stats={[
          { label: "Followers", value: fansCount },
          { label: "Sales", value: salesAgg._sum.sold ?? 0 },
          { label: "Subscribers", value: subscriberCount },
        ]}
        actions={<ProfileCardActions targetUserId={user.id} handle={user.handle} displayName={user.displayName} />}
        extra={<ProfileMetaLine location={sections.location ? user.profileLocation : null} tags={user.tags} />}
      />

      <div className="flex flex-col items-center px-4 text-center">
        {sections.links && (
          <div className="mt-2">
            <ProfileLinkBadges links={socialLinks} />
          </div>
        )}
        <div className="mx-auto w-full max-w-xl">
          {sections.products && <CatalogSubscriptionCard creator={{ id: user.id, displayName: user.displayName }} plans={subscriptionPlans} />}
        </div>
        <ReportButton targetType="PROFILE" targetId={user.id} className="mt-2 text-[13px] text-ink-3" />
      </div>

      <div className="px-4 md:px-6">

        {sections.products && (
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
              venue: ev.venue,
              isVirtual: ev.isVirtual,
              role: ev.creatorId === user.id ? null : (LINEUP_ROLE_LABEL[ev.lineup[0]?.role ?? "ARTIST"] ?? "Artist"),
              tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
            }))}
          />
        </OwnedBadgesProvider>
        )}

        {sections.links && <ProfileLinkList links={socialLinks} />}

        {libraryItems.length > 0 && (
          <section className="mt-6">
            <h2 className="font-serif text-[24px] font-bold">Music library</h2>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {libraryItems.map(({ product: p }) => (
                <Link key={p.id} href={`/r/${p.id}`} className="min-w-0">
                  <span className="block aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-red/50 to-black">
                    <FallbackImg src={(p.release?.artworkLadder as Record<string, string> | null)?.["256"] ?? null} alt={p.title} className="h-full w-full object-cover" fallback={null} />
                  </span>
                  <span className="mt-1.5 block truncate text-[13px] font-semibold">{p.title}</span>
                  <span className="block truncate text-[11px] text-ink-3">{p.creator.displayName}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Posts open on their own page (explicit ask, 2026-11-11). */}
        {publicPostCount > 0 && (
          <Link
            href={`/u/${user.handle}/posts`}
            className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#111] px-4 py-3.5 md:max-w-2xl"
          >
            <span>
              <span className="block text-[16px] font-semibold">View Socials posts</span>
              <span className="block text-[13px] text-ink-3">
                {publicPostCount.toLocaleString("en-NG")} post{publicPostCount === 1 ? "" : "s"} by {user.displayName}
              </span>
            </span>
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-ink-2" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
