import { db } from "@/lib/db";

// Signals feeding the For You order — gathered per-viewer, live, on every
// request rather than precomputed. Each query is bounded by the viewer's
// own history (their likes/plays/purchases/follows), not a global scan, so
// this stays cheap at this app's scale; revisit with a precomputed table if
// that ever stops being true (same spirit as DECISIONS.md's "no pagination
// ... revisit with a cursor" note). Deliberately not a new Prisma model —
// this project's prisma schema changes don't auto-reach production, so
// every schema change here is a manual migration risk worth avoiding.
const SIGNAL_WINDOW_DAYS = 90;

export type ForYouSignals = {
  likedAuthorCounts: Map<string, number>;
  commentedAuthorCounts: Map<string, number>;
  playCounts: Map<string, number>;
  purchasedAuthorIds: Set<string>;
  networkProximity: Map<string, number>;
  viewerTags: Set<string>;
};

export async function fetchForYouSignals(userId: string, followedIds: string[]): Promise<ForYouSignals> {
  const since = new Date(Date.now() - SIGNAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [likedPosts, commentedPosts, plays, entitlements, network, viewer] = await Promise.all([
    db.postLike.findMany({
      where: { userId, createdAt: { gt: since } },
      select: { post: { select: { authorId: true } } },
    }),
    db.comment.findMany({
      where: { authorId: userId, createdAt: { gt: since } },
      select: { post: { select: { authorId: true } } },
    }),
    db.trackPlay.groupBy({ by: ["creatorId"], where: { userId, createdAt: { gt: since } }, _count: true }),
    db.entitlement.findMany({
      where: { userId, revokedAt: null },
      select: { product: { select: { creatorId: true } } },
    }),
    followedIds.length > 0
      ? db.follow.groupBy({ by: ["followedId"], where: { followerId: { in: followedIds } }, _count: true })
      : Promise.resolve([]),
    db.user.findUnique({ where: { id: userId }, select: { tags: true } }),
  ]);

  const likedAuthorCounts = new Map<string, number>();
  for (const { post } of likedPosts) likedAuthorCounts.set(post.authorId, (likedAuthorCounts.get(post.authorId) ?? 0) + 1);

  const commentedAuthorCounts = new Map<string, number>();
  for (const { post } of commentedPosts) commentedAuthorCounts.set(post.authorId, (commentedAuthorCounts.get(post.authorId) ?? 0) + 1);

  const playCounts = new Map<string, number>();
  for (const row of plays) playCounts.set(row.creatorId, row._count);

  const purchasedAuthorIds = new Set(entitlements.map((e) => e.product.creatorId));

  const networkProximity = new Map<string, number>();
  for (const row of network) networkProximity.set(row.followedId, row._count);

  return {
    likedAuthorCounts,
    commentedAuthorCounts,
    playCounts,
    purchasedAuthorIds,
    networkProximity,
    viewerTags: new Set(viewer?.tags ?? []),
  };
}

// Weights are a starting point, not a tuned model — retune once there's
// real usage data. Purchase is a one-off flag (a past purchase is a
// lasting relationship, not decayed like the windowed counts above), the
// rest are log1p-damped counts so one hyperactive relationship can't
// permanently bury every other creator.
const WEIGHTS = {
  follow: 5,
  purchase: 4,
  networkProximity: 2,
  like: 1.5,
  play: 1,
  comment: 1,
  tagOverlap: 0.75,
};

function affinityScore(
  authorId: string,
  authorTags: string[] | undefined,
  followedIds: Set<string>,
  signals: ForYouSignals,
): number {
  const tagOverlap = authorTags ? authorTags.filter((t) => signals.viewerTags.has(t)).length : 0;

  return (
    (followedIds.has(authorId) ? WEIGHTS.follow : 0) +
    (signals.purchasedAuthorIds.has(authorId) ? WEIGHTS.purchase : 0) +
    WEIGHTS.networkProximity * Math.log1p(signals.networkProximity.get(authorId) ?? 0) +
    WEIGHTS.like * Math.log1p(signals.likedAuthorCounts.get(authorId) ?? 0) +
    WEIGHTS.play * Math.log1p(signals.playCounts.get(authorId) ?? 0) +
    WEIGHTS.comment * Math.log1p(signals.commentedAuthorCounts.get(authorId) ?? 0) +
    WEIGHTS.tagOverlap * tagOverlap
  );
}

// Small monotonic decay. Combined multiplicatively with affinity below
// (not added) so recency acts as a gate, not just a tiebreaker — a
// brand-new post from a zero-signal creator still outranks a stale post
// from a creator you engage with heavily, once it's old enough. Without a
// gate, a big enough affinity score would let month-old posts permanently
// bury today's, which would defeat "genuine discovery, never fully
// collapse to creators I already know."
function recencyScore(createdAt: Date): number {
  const hoursSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  return 1 / (1 + hoursSince / 24);
}

export type ScorablePost = {
  authorId: string;
  authorTags?: string[];
  createdAt: Date;
};

// Pure — no DB access — so it's unit-testable with fabricated signals.
// Returns indices into `posts` in ranked order (stable sort: ties keep
// their original createdAt-desc order).
export function scoreForYou<T extends ScorablePost>(posts: T[], signals: ForYouSignals, followedIds: string[]): T[] {
  const followedSet = new Set(followedIds);
  return posts
    .map((post, index) => ({
      post,
      index,
      score: (1 + affinityScore(post.authorId, post.authorTags, followedSet, signals)) * recencyScore(post.createdAt),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.post);
}
