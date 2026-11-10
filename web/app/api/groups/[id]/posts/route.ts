import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { parseMentions } from "@/lib/groups/mentions";
import { canOpenChannel, isMembershipActive } from "@/lib/communities/constants";

// Community channels (v2, 2026-11-09): ?channel=<id> (GET) / channelId (POST)
// picks a channel; none or "general" is the community's original chat, which
// is all the mobile app knows about. A lapsed paid membership loses access.
async function resolveChannel(groupId: string, raw: string | null | undefined) {
  if (!raw || raw === "general") return { channel: null as null | { id: string; kind: string; planIds: string[] } };
  const channel = await db.communityChannel.findFirst({ where: { id: raw, groupId }, select: { id: true, kind: true, planIds: true } });
  return channel ? { channel } : null;
}

const authorSelect = {
  select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true },
} as const;
const replyToSelect = { select: { id: true, body: true, author: { select: { displayName: true } } } } as const;

function serialize(
  p: {
    id: string;
    body: string;
    imageUrl: string | null;
    createdAt: Date;
    author: {
      id: string;
      handle: string;
      displayName: string;
      avatarUrl: string | null;
      isVerified: boolean;
      verificationBadges: string[];
    };
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

    const [membership, group, resolved] = await Promise.all([
      db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } }),
      db.fanbaseGroup.findUnique({ where: { id }, select: { creatorId: true } }),
      resolveChannel(id, req.nextUrl.searchParams.get("channel")),
    ]);
    if (!membership || !group) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    if (!resolved) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    const isOwner = group.creatorId === user.id;
    const allowed = resolved.channel ? canOpenChannel(resolved.channel, membership, isOwner) : isOwner || membership.role === "ADMIN" || isMembershipActive(membership);
    if (!allowed) return NextResponse.json({ error: "Your membership doesn't include this channel" }, { status: 403 });

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

    // Newest 200, shown oldest first.
    const newest = await db.post.findMany({
      where: { groupId: id, channelId: resolved.channel?.id ?? null },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        author: authorSelect,
        replyTo: replyToSelect,
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: user.id }, select: { userId: true } },
        poll: { include: { votes: true } },
      },
    });

    const posts = newest.reverse();
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
  channelId: z.string().min(1).max(64).optional(),
});

// PRD §11: default new groups to creator-only posting; who else may post is
// per-group (postPermission). Not a role hardcoded on Post — checked here,
// against the group's current setting, every time.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { body, imageUrl, pollOptions, replyToId, channelId } = createSchema.parse(await req.json());

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    const resolved = await resolveChannel(id, channelId);
    if (!resolved) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    const channel = resolved.channel;
    const isOwner = group.creatorId === user.id;
    const isAdmin = isOwner || membership?.role === "ADMIN";
    const canPost = channel?.kind === "ANNOUNCEMENTS"
      ? isAdmin
      : (channel ? canOpenChannel(channel, membership, isOwner) : isAdmin || isMembershipActive(membership)) &&
        (group.postPermission === "ALL_MEMBERS" ? Boolean(membership) || isOwner : group.postPermission === "ADMINS" ? isAdmin : isOwner);
    if (!canPost) return NextResponse.json({ error: "You can't post in this channel" }, { status: 403 });

    if (replyToId) {
      const target = await db.post.findUnique({ where: { id: replyToId }, select: { groupId: true, channelId: true } });
      if (!target || target.groupId !== id || target.channelId !== (channel?.id ?? null)) return NextResponse.json({ error: "Can't reply to that message" }, { status: 400 });
    }

    const post = await db.post.create({
      data: {
        authorId: user.id,
        groupId: id,
        channelId: channel?.id ?? null,
        body,
        imageUrl: imageUrl ?? null,
        replyToId: replyToId ?? null,
        poll: pollOptions ? { create: { options: pollOptions } } : undefined,
      },
      include: { author: authorSelect, replyTo: replyToSelect, poll: { include: { votes: true } } },
    });

    // Text preview for the push/bell — a photo or poll message may have no text.
    const preview = body.trim() ? body.slice(0, 100) : imageUrl ? "📷 Photo" : pollOptions ? "📊 Poll" : "New message";
    // Persistent + reliable (lib/notifications/create.ts): saved to every
    // recipient's bell and pushed after the response. Ordinary messages share
    // one tag per Fanbase (a new one replaces the last on screen but still
    // re-alerts);  /  get their own entry so they never get
    // silently replaced by chatter.
    const fanbaseNotify = (userIds: string[], n: { title: string; body: string; url: string; important?: boolean }) =>
      notifyUsersAfterResponse(userIds, {
        kind: "FANBASE",
        title: n.title,
        body: n.body,
        url: n.url,
        icon: user.avatarUrl ?? undefined,
        tag: n.important ? undefined : `fanbase-${id}`,
      });

    const memberRows = await db.membership.findMany({
      where: { groupId: id, userId: { not: user.id } },
      select: { userId: true, role: true, planId: true, expiresAt: true, suspendedAt: true, user: { select: { handle: true } } },
    });
    // Only people who can open this channel hear about it.
    const otherMembers = memberRows.filter((m) =>
      channel ? canOpenChannel(channel, m, m.userId === group.creatorId) : m.role === "ADMIN" || m.userId === group.creatorId || isMembershipActive(m),
    );
    const chatUrl = `/groups/${id}${channel ? `?channel=${channel.id}` : ""}`;

    // @all/@username is an admin "get their attention" tool (per spec) — a
    // regular member typing "@all" still renders as a chip client-side, but
    // doesn't get this escalated push treatment.
    const isAdminSender = membership?.role === "ADMIN" || group.creatorId === user.id;
    const { mentionsAll, handles } = isAdminSender ? parseMentions(body) : { mentionsAll: false, handles: [] as string[] };

    if (isAdminSender && mentionsAll) {
      fanbaseNotify(
        otherMembers.map((m) => m.userId),
        { important: true, title: `📣 ${group.name}`, body: `${user.displayName} needs everyone's attention: ${preview}`, url: chatUrl },
      );
    } else if (isAdminSender && handles.length > 0) {
      const mentioned = otherMembers.filter((m) => handles.includes(m.user.handle.toLowerCase()));
      const rest = otherMembers.filter((m) => !mentioned.includes(m));
      if (mentioned.length > 0) {
        fanbaseNotify(
          mentioned.map((m) => m.userId),
          { important: true, title: `${user.displayName} mentioned you in ${group.name}`, body: preview, url: chatUrl },
        );
      }
      if (rest.length > 0) {
        fanbaseNotify(
          rest.map((m) => m.userId),
          { title: group.name, body: `${user.displayName}: ${preview}`, url: chatUrl },
        );
      }
    } else {
      fanbaseNotify(
        otherMembers.map((m) => m.userId),
        { title: group.name, body: `${user.displayName}: ${preview}`, url: chatUrl },
      );
    }

    return NextResponse.json({ post: serialize(post, 0, 0, false, user.id) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
