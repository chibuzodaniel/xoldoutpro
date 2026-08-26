import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push/send";
import { parseMentions } from "@/lib/groups/mentions";

const authorSelect = { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true } } as const;
const replyToSelect = { select: { id: true, body: true, author: { select: { displayName: true } } } } as const;

function serialize(
  p: {
    id: string;
    body: string;
    imageUrl: string | null;
    createdAt: Date;
    author: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean };
    replyTo: { id: string; body: string; author: { displayName: string } } | null;
    poll?: { options: string[]; votes: { userId: string; optionIndex: number }[] } | null;
  },
  likeCount: number,
  commentCount: number,
  likedByMe: boolean,
  userId: string,
) {
  return {
    id: p.id,
    body: p.body,
    imageUrl: p.imageUrl,
    createdAt: p.createdAt,
    author: p.author,
    replyTo: p.replyTo,
    likeCount,
    commentCount,
    likedByMe,
    poll: p.poll
      ? {
          options: p.poll.options,
          counts: p.poll.options.map((_, i) => p.poll!.votes.filter((v) => v.optionIndex === i).length),
          myVote: p.poll.votes.find((v) => v.userId === userId)?.optionIndex ?? null,
          totalVotes: p.poll.votes.length,
        }
      : null,
  };
}

// Chat-style, oldest first (image9 reference) — new messages grow downward
// toward a bottom-pinned composer, not a feed's newest-first ordering.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    if (!membership) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    // Captured before the update below overwrites it — the client uses this
    // watermark to scroll to the first message newer than it (unread) rather
    // than always opening at the bottom, same "unread since" the Fanbase
    // list's badge count is computed from.
    const readWatermark = membership.lastReadAt ?? membership.joinedAt;

    // Fire-and-forget: opening the thread is what clears its Fanbase-list
    // unread badge (GET /api/groups reads this back), same "viewing marks
    // read" pattern as the notification bell.
    db.membership
      .update({ where: { groupId_userId: { groupId: id, userId: user.id } }, data: { lastReadAt: new Date() } })
      .catch(() => {});

    const posts = await db.post.findMany({
      where: { groupId: id },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        author: authorSelect,
        replyTo: replyToSelect,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: user.id }, select: { userId: true } },
        poll: { include: { votes: true } },
      },
    });

    return NextResponse.json({
      posts: posts.map((p) => serialize(p, p._count.likes, p._count.comments, p.likes.length > 0, user.id)),
      readWatermark,
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
  replyToId: z.string().min(1).optional(),
});

// PRD §11: default new groups to creator-only posting; who else may post is
// per-group (postPermission). Not a role hardcoded on Post — checked here,
// against the group's current setting, every time.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { body, imageUrl, pollOptions, replyToId } = createSchema.parse(await req.json());

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

    if (replyToId) {
      const target = await db.post.findUnique({ where: { id: replyToId }, select: { groupId: true } });
      if (!target || target.groupId !== id) return NextResponse.json({ error: "Can't reply to that message" }, { status: 400 });
    }

    const post = await db.post.create({
      data: {
        authorId: user.id,
        groupId: id,
        body,
        imageUrl: imageUrl ?? null,
        replyToId: replyToId ?? null,
        poll: pollOptions ? { create: { options: pollOptions } } : undefined,
      },
      include: { author: authorSelect, replyTo: replyToSelect, poll: { include: { votes: true } } },
    });

    const otherMembers = await db.membership.findMany({
      where: { groupId: id, userId: { not: user.id } },
      select: { userId: true, user: { select: { handle: true } } },
    });

    // @all/@username is an admin "get their attention" tool (per spec) — a
    // regular member typing "@all" still renders as a chip client-side, but
    // doesn't get this escalated push treatment.
    const isAdminSender = membership?.role === "ADMIN" || group.creatorId === user.id;
    const { mentionsAll, handles } = isAdminSender ? parseMentions(body) : { mentionsAll: false, handles: [] as string[] };

    if (isAdminSender && mentionsAll) {
      sendPushToUsers(
        otherMembers.map((m) => m.userId),
        { title: `📣 ${group.name}`, body: `${user.displayName} needs everyone's attention: ${body.slice(0, 100)}`, url: `/groups/${id}` },
      );
    } else if (isAdminSender && handles.length > 0) {
      const mentioned = otherMembers.filter((m) => handles.includes(m.user.handle.toLowerCase()));
      const rest = otherMembers.filter((m) => !mentioned.includes(m));
      if (mentioned.length > 0) {
        sendPushToUsers(
          mentioned.map((m) => m.userId),
          { title: `${user.displayName} mentioned you in ${group.name}`, body: body.slice(0, 100), url: `/groups/${id}` },
        );
      }
      if (rest.length > 0) {
        sendPushToUsers(
          rest.map((m) => m.userId),
          { title: group.name, body: `${user.displayName}: ${body.slice(0, 100)}`, url: `/groups/${id}` },
        );
      }
    } else {
      sendPushToUsers(
        otherMembers.map((m) => m.userId),
        { title: group.name, body: `${user.displayName}: ${body.slice(0, 100)}`, url: `/groups/${id}` },
      );
    }

    return NextResponse.json({ post: serialize(post, 0, 0, false, user.id) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
