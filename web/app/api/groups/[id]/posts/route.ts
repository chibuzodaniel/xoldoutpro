import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const authorSelect = { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    if (!membership) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    const posts = await db.post.findMany({
      where: { groupId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        author: authorSelect,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: user.id }, select: { userId: true } },
        poll: { include: { votes: true } },
      },
    });

    return NextResponse.json({
      posts: posts.map((p) => ({
        id: p.id,
        body: p.body,
        imageUrl: p.imageUrl,
        createdAt: p.createdAt,
        author: p.author,
        likeCount: p._count.likes,
        commentCount: p._count.comments,
        likedByMe: p.likes.length > 0,
        poll: p.poll
          ? {
              options: p.poll.options,
              counts: p.poll.options.map((_, i) => p.poll!.votes.filter((v) => v.optionIndex === i).length),
              myVote: p.poll.votes.find((v) => v.userId === user.id)?.optionIndex ?? null,
              totalVotes: p.poll.votes.length,
            }
          : null,
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
  pollOptions: z.array(z.string().trim().min(1).max(80)).min(2).max(6).optional(),
});

// PRD §11: default new groups to creator-only posting; who else may post is
// per-group (postPermission). Not a role hardcoded on Post — checked here,
// against the group's current setting, every time.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { body, imageUrl, pollOptions } = createSchema.parse(await req.json());

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    const canPost =
      group.postPermission === "ALL_MEMBERS"
        ? Boolean(membership)
        : group.postPermission === "ADMINS"
          ? membership?.role === "ADMIN"
          : group.creatorId === user.id;
    if (!canPost) return NextResponse.json({ error: "You can't post in this group" }, { status: 403 });

    const post = await db.post.create({
      data: {
        authorId: user.id,
        groupId: id,
        body,
        imageUrl: imageUrl ?? null,
        poll: pollOptions ? { create: { options: pollOptions } } : undefined,
      },
      include: { author: authorSelect, poll: true },
    });

    return NextResponse.json({
      post: {
        id: post.id,
        body: post.body,
        imageUrl: post.imageUrl,
        createdAt: post.createdAt,
        author: post.author,
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
        poll: post.poll ? { options: post.poll.options, counts: post.poll.options.map(() => 0), myVote: null, totalVotes: 0 } : null,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
