import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const PLAY_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

// The feed is "suggested," not strictly follows-only: creators you follow,
// creators whose songs you play often (recent TrackPlay volume), and
// creators you've shown interest in (liked one of their posts, or bought
// something from them) all count toward the pool of authors shown — a
// listener who's never tapped "follow" but plays an artist constantly, or
// just bought their EP, still sees their announcements.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const [follows, topPlayed, likedPosts, purchases] = await Promise.all([
      db.follow.findMany({
        where: { followerId: user.id },
        select: { followed: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } } },
      }),
      db.trackPlay.groupBy({
        by: ["creatorId"],
        where: { userId: user.id, createdAt: { gte: new Date(Date.now() - PLAY_LOOKBACK_MS) } },
        _count: { creatorId: true },
        orderBy: { _count: { creatorId: "desc" } },
        take: 15,
      }),
      db.postLike.findMany({ where: { userId: user.id }, select: { post: { select: { authorId: true } } } }),
      db.entitlement.findMany({ where: { userId: user.id }, select: { product: { select: { creatorId: true } } } }),
    ]);

    const following = follows.map((f) => f.followed);
    const authorIds = [
      ...new Set([
        ...following.map((f) => f.id),
        ...topPlayed.map((p) => p.creatorId),
        ...likedPosts.map((l) => l.post.authorId),
        ...purchases.map((p) => p.product.creatorId),
        user.id,
      ]),
    ];

    const posts = await db.post.findMany({
      where: { authorId: { in: authorIds }, groupId: null },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } },
        _count: { select: { likes: true } },
        likes: { where: { userId: user.id }, select: { userId: true } },
      },
    });

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
      post: { id: post.id, body: post.body, imageUrl: post.imageUrl, createdAt: post.createdAt, author: post.author, likeCount: 0, likedByMe: false },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
