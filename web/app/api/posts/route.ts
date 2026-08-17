import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// PRD §11 MVP: the Fanbase (Socials) tab is a reverse-chronological feed of
// posts from creators a user follows. Own posts are included too, so the
// composer feels functional without following yourself.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const follows = await db.follow.findMany({
      where: { followerId: user.id },
      select: { followed: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } } },
    });
    const following = follows.map((f) => f.followed);
    const authorIds = [...following.map((f) => f.id), user.id];

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
