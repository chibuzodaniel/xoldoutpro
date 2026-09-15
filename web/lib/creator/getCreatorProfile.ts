import { db } from "@/lib/db";
import { discoverCardInclude } from "@/lib/discover/getDiscoverData";

// Public, non-personalized profile data — deliberately selects only fields
// safe for an unauthenticated API (excludes email, firebaseUid, fcmTokens,
// and other account-internal columns User.findMany elsewhere never needs to
// hide because it never leaves the server).
export async function getCreatorProfile(handle: string) {
  const user = await db.user.findUnique({
    where: { handle },
    select: {
      id: true,
      handle: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      coverUrl: true,
      tags: true,
      socialLinks: true,
      isVerified: true,
      verificationBadges: true,
    },
  });
  if (!user) return null;

  const [catalog, events, fansCount, salesAgg] = await Promise.all([
    db.product.findMany({
      where: { creatorId: user.id, type: { in: ["RELEASE", "BEAT", "MERCH"] }, status: "PUBLISHED" },
      include: discoverCardInclude,
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
  ]);

  return { user, catalog, events, fansCount, totalSold: salesAgg._sum.sold ?? 0 };
}
