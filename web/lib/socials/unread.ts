import { db } from "@/lib/db";

// Mirrors the events that already trigger a push (lib/push/send.ts) — new
// comment/like on your post, new follower, new message in a group you're
// in, and a pending join request on a group you admin — but as an in-app
// count instead of a device push, so the Socials tab can show a badge for
// activity that happened while the app itself was open (push and the badge
// are deliberately separate signals, not one driving the other).
export async function getSocialsUnreadCount(userId: string, since: Date | null): Promise<number> {
  const sinceDate = since ?? new Date(0);

  const [comments, likes, follows, groupMessages, joinRequests] = await Promise.all([
    db.comment.count({
      where: { authorId: { not: userId }, createdAt: { gt: sinceDate }, post: { authorId: userId } },
    }),
    db.postLike.count({
      where: { userId: { not: userId }, createdAt: { gt: sinceDate }, post: { authorId: userId } },
    }),
    db.follow.count({ where: { followedId: userId, createdAt: { gt: sinceDate } } }),
    db.post.count({
      where: {
        authorId: { not: userId },
        createdAt: { gt: sinceDate },
        groupId: { not: null },
        group: { memberships: { some: { userId } } },
      },
    }),
    db.joinRequest.count({
      where: { status: "PENDING", createdAt: { gt: sinceDate }, group: { memberships: { some: { userId, role: "ADMIN" } } } },
    }),
  ]);

  return comments + likes + follows + groupMessages + joinRequests;
}
