import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

// Like / dislike / clear on a post comment — same rules as song comments:
// likeCount kept in step here, dislikes never shown as a number.
const schema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, commentId } = await params;
    const { value } = schema.parse(await req.json());
    const key = { commentId_userId: { commentId, userId: user.id } };

    const result = await db.$transaction(async (tx) => {
      const [comment, existing] = await Promise.all([
        tx.comment.findUnique({ where: { id: commentId }, select: { likeCount: true, authorId: true, body: true, postId: true, post: { select: { groupId: true } } } }),
        tx.commentVote.findUnique({ where: key, select: { value: true } }),
      ]);
      if (!comment || comment.postId !== id) return null;
      const old = existing?.value ?? 0;
      if (old === value) return { likeCount: comment.likeCount, comment: null };
      if (value === 0) await tx.commentVote.delete({ where: key });
      else await tx.commentVote.upsert({ where: key, create: { commentId, userId: user.id, value }, update: { value } });
      const delta = (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0);
      if (!delta) return { likeCount: comment.likeCount, comment: null };
      const updated = await tx.comment.update({ where: { id: commentId }, data: { likeCount: { increment: delta } }, select: { likeCount: true } });
      return { likeCount: updated.likeCount, comment: value === 1 && old !== 1 ? comment : null };
    });

    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.comment && result.comment.authorId !== user.id) {
      notifyUsersAfterResponse([result.comment.authorId], {
        kind: "LIKE",
        title: "Your comment got a like",
        body: `${user.displayName} liked: "${result.comment.body.slice(0, 80)}"`,
        url: result.comment.post.groupId ? `/groups/${result.comment.post.groupId}` : "/socials",
        icon: user.avatarUrl ?? undefined,
        actorId: user.id,
        tag: `post-comment-like-${commentId}`,
      });
    }
    return NextResponse.json({ likeCount: Math.max(0, result.likeCount), myVote: value });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
