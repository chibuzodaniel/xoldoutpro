import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { fetchForYouSignals, scoreForYou } from "@/lib/socials/forYouRanking";

const authorSelect = { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } } as const;

// Two modes, both non-group announcement posts:
//
// "following" (default) — strictly creators you follow, plus your own
// posts, newest-first. No play/like/purchase-based expansion — that pool
// blurred the distinction between this tab and For You, so it was pulled
// out entirely.
//
// "forYou" (?feed=forYou) — genuine discovery, no pool restriction at all:
// every public post from every creator except your own is eligible,
// regardless of any prior relationship. What changes is *order*, not the
// pool: candidates are ranked by affinity to the viewer (follows, likes,
// plays, purchases, network proximity, shared tags — see
// lib/socials/forYouRanking.ts) plus a recency factor, so a brand-new post
// from an unrelated creator still surfaces rather than being filtered out.
// PostCard's inline Follow button is what lets a viewer act on something
// they discover here.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const forYou = req.nextUrl.searchParams.get("feed") === "forYou";

    const follows = await db.follow.findMany({
      where: { followerId: user.id },
      select: { followed: authorSelect },
    });
    const following = follows.map((f) => f.followed);
    const followedIds = new Set(following.map((f) => f.id));

    // Wider candidate pool than the 50 actually returned, purely so ranking
    // has something to reorder among — the public "50 posts, no pagination"
    // contract (DECISIONS.md) is unchanged, just which 50 win and their order.
    const candidatePosts = await db.post.findMany({
      where: {
        groupId: null,
        ...(forYou ? { authorId: { not: user.id } } : { authorId: { in: [...followedIds, user.id] } }),
      },
      orderBy: { createdAt: "desc" },
      take: forYou ? 150 : 50,
      include: {
        author: authorSelect,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: user.id }, select: { userId: true } },
      },
    });

    let posts = candidatePosts;
    if (forYou && candidatePosts.length > 0) {
      const authorIds = [...new Set(candidatePosts.map((p) => p.authorId))];
      const [signals, authorTagRows] = await Promise.all([
        fetchForYouSignals(user.id, [...followedIds]),
        db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, tags: true } }),
      ]);
      const tagsByAuthor = new Map(authorTagRows.map((a) => [a.id, a.tags]));

      const ranked = scoreForYou(
        candidatePosts.map((p) => ({ ...p, authorTags: tagsByAuthor.get(p.authorId) })),
        signals,
        [...followedIds],
      );
      posts = ranked.slice(0, 50);
    } else {
      posts = candidatePosts.slice(0, 50);
    }

    return NextResponse.json({
      following,
      posts: posts.map((p) => ({
        id: p.id,
        body: p.body,
        imageUrl: p.imageUrl,
        createdAt: p.createdAt,
        author: p.author,
        likeCount: p._count.likes,
        likedByMe: p.likes.length > 0,
        commentCount: p._count.comments,
        followedByMe: followedIds.has(p.authorId),
      })),
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const createSchema = z.object({
  body: z.string().trim().min(1).max(500),
  imageUrl: z.string().url().nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { body, imageUrl } = createSchema.parse(await req.json());

    const post = await db.post.create({
      data: { authorId: user.id, body, imageUrl: imageUrl ?? null },
      include: { author: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });

    return NextResponse.json({
      post: {
        id: post.id,
        body: post.body,
        imageUrl: post.imageUrl,
        createdAt: post.createdAt,
        author: post.author,
        likeCount: 0,
        likedByMe: false,
        commentCount: 0,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
