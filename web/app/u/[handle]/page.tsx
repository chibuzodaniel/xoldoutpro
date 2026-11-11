import Link from "next/link";
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
import { CatalogSubscriptionCard } from "@/components/subscriptions/CatalogSubscriptionCard";
import { readSections } from "@/lib/profile/sections";
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
  const [catalog, events, fansCount, salesAgg, featuredOn, subscriptionPlans, subscriberCount, publicPosts, libraryItems] = await Promise.all([
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
      ? db.post.findMany({
          where: { authorId: user.id, groupId: null, repostOfId: null, audience: "EVERYONE" },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            body: true,
            imageUrl: true,
            createdAt: true,
            _count: { select: { likes: true, comments: true } },
            attachedProduct: { select: { id: true, type: true, title: true, status: true } },
            attachedEvent: { select: { id: true, title: true, status: true } },
          },
        })
      : Promise.resolve([]),
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
          {subscriptionPlans.length > 0 && (
            <>
              <span className="px-1.5 text-ink-3">•</span> {subscriberCount.toLocaleString("en-NG")} Subscribers
            </>
          )}
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
        {sections.location && user.profileLocation && (
          <p className="mt-2 flex items-center gap-1.5 text-[14px] text-ink-3">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z" strokeLinejoin="round" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            {user.profileLocation}
          </p>
        )}
        {sections.links && (
          <div className="mt-4">
            <ProfileLinkBadges links={socialLinks} />
          </div>
        )}
        <div className="mx-auto mt-5 w-full max-w-md">
          <ProfileActions targetUserId={user.id} handle={user.handle} displayName={user.displayName} />
          {sections.products && <CatalogSubscriptionCard creator={{ id: user.id, displayName: user.displayName }} plans={subscriptionPlans} />}
        </div>
        <ReportButton targetType="PROFILE" targetId={user.id} className="mt-3 text-xs text-ink-3" />
      </div>

      <div className="px-4 md:px-6">
        {sections.links && <ProfileLinkList links={socialLinks} />}

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
              tiers: ev.tiers.map((t) => ({ priceKobo: t.product.priceKobo, stockPolicy: t.product.stockPolicy })),
            }))}
          />
        </OwnedBadgesProvider>
        )}

        {libraryItems.length > 0 && (
          <section className="mt-8">
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

        {publicPosts.length > 0 && (
          <section className="mt-8">
            <h2 className="font-serif text-[24px] font-bold">Posts</h2>
            <div className="mt-3 flex flex-col gap-3 md:max-w-2xl">
              {publicPosts.map((post) => {
                const att = post.attachedProduct?.status === "PUBLISHED" ? post.attachedProduct : null;
                const ev = post.attachedEvent?.status === "PUBLISHED" ? post.attachedEvent : null;
                return (
                  <article key={post.id} className="rounded-2xl border border-red/15 bg-red/10 p-4">
                    <p className="text-[12px] text-ink-3">{post.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{post.body}</p>
                    {post.imageUrl && (
                      <span className="mt-3 block aspect-square max-w-sm overflow-hidden rounded-lg bg-surface-2">
                        <FallbackImg src={post.imageUrl} alt="" className="h-full w-full object-cover" fallback={null} />
                      </span>
                    )}
                    {(att || ev) && (
                      <Link
                        href={att ? `/${att.type === "BEAT" ? "b" : att.type === "MERCH" ? "m" : "r"}/${att.id}` : `/e/${ev!.id}`}
                        className="mt-3 block rounded-xl border border-line bg-surface px-3 py-2 text-sm font-semibold"
                      >
                        {att ? att.title : ev!.title} →
                      </Link>
                    )}
                    <p className="mt-2 text-[12px] text-ink-3">
                      {post._count.likes} likes · {post._count.comments} comments
                    </p>
                  </article>
                );
              })}
            </div>
            <Link href="/socials" className="mt-3 inline-block text-sm font-semibold text-red-soft">
              See more on Socials →
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
