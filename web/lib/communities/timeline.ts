import { db } from "@/lib/db";
import { isMembershipActive } from "@/lib/communities/constants";
import type { PostingMode, TimelineMedia } from "@/lib/communities/timelineRules";

// Community Timeline server rules (explicit ask, 2026-11-11). Every route that
// reads or writes community posts goes through these, so members can't get
// round the posting mode or see unapproved posts with a direct API call.

/** Older communities have no postingMode yet: derive it from postPermission. */
export function effectivePostingMode(group: { postingMode: string | null; postPermission: string }): PostingMode {
  if (group.postingMode === "OPEN" || group.postingMode === "APPROVAL" || group.postingMode === "ADMIN_ONLY") return group.postingMode;
  return group.postPermission === "ALL_MEMBERS" ? "OPEN" : "ADMIN_ONLY";
}

/**
 * The viewer's standing in a community: admin (owner or ADMIN role — the
 * "authorized moderators"), an active member (paid time left, not suspended),
 * and whether they may read the Timeline at all.
 */
export async function timelineViewer(groupId: string, userId: string | null | undefined) {
  const group = await db.fanbaseGroup.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, creatorId: true, postingMode: true, postPermission: true, suspendedAt: true },
  });
  if (!group) return null;
  const membership = userId ? await db.membership.findUnique({ where: { groupId_userId: { groupId, userId } } }) : null;
  const isOwner = Boolean(userId && group.creatorId === userId);
  const isAdmin = isOwner || membership?.role === "ADMIN";
  const isActiveMember = isAdmin || isMembershipActive(membership);
  const canRead = isActiveMember && (!group.suspendedAt || isAdmin);
  const mode = effectivePostingMode(group);
  // What happens when this viewer publishes: straight on, into review, or not at all.
  const publish: "PUBLISHED" | "PENDING" | null = !canRead || group.suspendedAt ? null : isAdmin ? "PUBLISHED" : mode === "OPEN" ? "PUBLISHED" : mode === "APPROVAL" ? "PENDING" : null;
  return { group, membership, isOwner, isAdmin, isActiveMember, canRead, mode, publish };
}

/** Only published posts are visible to others; authors and admins also see their own pending ones. */
export function visibleTo(viewerId: string | null | undefined, isAdmin: boolean) {
  if (isAdmin) return { status: { not: "REJECTED" } };
  return viewerId ? { OR: [{ status: "PUBLISHED" }, { status: "PENDING", authorId: viewerId }] } : { status: "PUBLISHED" };
}

export const timelineInclude = (viewerId: string) => ({
  author: { select: { id: true, handle: true, displayName: true, avatarUrl: true, isVerified: true, verificationBadges: true } },
  replyTo: { select: { id: true, body: true, author: { select: { displayName: true } } } },
  _count: { select: { likes: true, comments: true } },
  likes: { where: { userId: viewerId }, select: { userId: true } },
  poll: { include: { votes: { select: { userId: true, optionIndex: true } } } },
});

type Row = {
  id: string;
  body: string;
  imageUrl: string | null;
  media: unknown;
  kind: string | null;
  status: string;
  pinnedAt: Date | null;
  editedAt: Date | null;
  createdAt: Date;
  authorId: string;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null; isVerified: boolean; verificationBadges: string[] };
  replyTo: { id: string; body: string; author: { displayName: string } } | null;
  _count: { likes: number; comments: number };
  likes: { userId: string }[];
  poll: { kind: string; options: string[]; closesAt: Date | null; votes: { userId: string; optionIndex: number }[] } | null;
};

export function serializeTimelinePost(p: Row, viewerId: string, adminIds: Set<string>) {
  const media: TimelineMedia[] = Array.isArray(p.media) ? (p.media as TimelineMedia[]) : p.imageUrl ? [{ url: p.imageUrl, type: "image" }] : [];
  return {
    id: p.id,
    kind: p.kind ?? "POST",
    status: p.status,
    body: p.body,
    media,
    pinned: Boolean(p.pinnedAt),
    edited: Boolean(p.editedAt),
    createdAt: p.createdAt,
    author: { ...p.author, isAdmin: adminIds.has(p.author.id) },
    replyTo: p.replyTo,
    likeCount: p._count.likes,
    likedByMe: p.likes.length > 0,
    commentCount: p._count.comments,
    poll: p.poll
      ? {
          kind: p.poll.kind,
          options: p.poll.options,
          counts: p.poll.options.map((_, i) => p.poll!.votes.filter((v) => v.optionIndex === i).length),
          myVote: p.poll.votes.find((v) => v.userId === viewerId)?.optionIndex ?? null,
          totalVotes: p.poll.votes.length,
          closesAt: p.poll.closesAt,
          closed: Boolean(p.poll.closesAt && p.poll.closesAt.getTime() <= Date.now()),
        }
      : null,
    mine: p.authorId === viewerId,
  };
}

export type TimelinePost = ReturnType<typeof serializeTimelinePost>;

/** Admin ids for "Admin" labels: the owner plus ADMIN members. One query. */
export async function adminIdsFor(groupId: string, creatorId: string) {
  const rows = await db.membership.findMany({ where: { groupId, role: "ADMIN" }, select: { userId: true } });
  return new Set([creatorId, ...rows.map((r) => r.userId)]);
}
