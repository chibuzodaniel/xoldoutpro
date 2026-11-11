import { db } from "@/lib/db";

// YouTube-style Socials comments (explicit ask, 2026-11-11): same shape as
// song comments (lib/music/songComments.ts) so the same UI renders both.

export const POST_COMMENT_PAGE = 20;
export const POST_COMMENT_MAX_LENGTH = 1000;

export const postCommentSelect = {
  id: true,
  body: true,
  createdAt: true,
  likeCount: true,
  replyCount: true,
  parentId: true,
  author: { select: { id: true, handle: true, displayName: true, avatarUrl: true } },
} as const;

/** The viewer's own like/dislike on each of these comments. */
export async function viewerCommentVotes(userId: string | undefined, commentIds: string[]) {
  if (!userId || commentIds.length === 0) return new Map<string, number>();
  const votes = await db.commentVote.findMany({ where: { userId, commentId: { in: commentIds } }, select: { commentId: true, value: true } });
  return new Map(votes.map((v) => [v.commentId, v.value]));
}

/**
 * Who may read/write comments on a post: anyone for a Socials post the viewer
 * can see; members only inside a community. Returns the post or null.
 */
export async function loadCommentablePost(postId: string, viewerId: string | undefined) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, groupId: true, audience: true } });
  if (!post) return null;
  if (post.groupId) {
    if (!viewerId) return null;
    const m = await db.membership.findUnique({ where: { groupId_userId: { groupId: post.groupId, userId: viewerId } }, select: { role: true } });
    if (!m) return null;
    return { ...post, viewerIsGroupAdmin: m.role === "ADMIN" };
  }
  if (post.audience === "FOLLOWERS" && viewerId !== post.authorId) {
    if (!viewerId) return null;
    const f = await db.follow.findUnique({ where: { followerId_followedId: { followerId: viewerId, followedId: post.authorId } }, select: { followerId: true } });
    if (!f) return null;
  }
  return { ...post, viewerIsGroupAdmin: false };
}
