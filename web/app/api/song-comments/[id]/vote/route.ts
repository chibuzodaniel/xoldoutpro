import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { songUrl, type SongKind } from "@/lib/music/songComments";

// Like / dislike / clear on a song comment. likeCount is kept in step here so
// listing never counts vote rows; dislikes are never shown as a number.
const schema = z.object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { value } = schema.parse(await req.json());
    const key = { commentId_userId: { commentId: id, userId: user.id } };

    const result = await db.$transaction(async (tx) => {
      const [comment, existing] = await Promise.all([
        tx.songComment.findUnique({ where: { id }, select: { likeCount: true, authorId: true, body: true, trackKind: true, productId: true } }),
        tx.songCommentVote.findUnique({ where: key, select: { value: true } }),
      ]);
      if (!comment) return null;
      const old = existing?.value ?? 0;
      if (old === value) return { likeCount: comment.likeCount, comment: null };

      if (value === 0) await tx.songCommentVote.delete({ where: key });
      else await tx.songCommentVote.upsert({ where: key, create: { commentId: id, userId: user.id, value }, update: { value } });

      const delta = (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0);
      if (!delta) return { likeCount: comment.likeCount, comment: null };
      const updated = await tx.songComment.update({
        where: { id },
        data: { likeCount: { increment: delta } },
        select: { likeCount: true },
      });
      // A new like (not a dislike or a clear) is worth telling the author about.
      return { likeCount: updated.likeCount, comment: value === 1 && old !== 1 ? comment : null };
    });

    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (result.comment && result.comment.authorId !== user.id) {
      const product = await db.product.findUnique({ where: { id: result.comment.productId }, select: { type: true } });
      notifyUsersAfterResponse([result.comment.authorId], {
        kind: "LIKE",
        title: "Your comment got a like",
        body: `${user.displayName} liked: "${result.comment.body.slice(0, 80)}"`,
        url: songUrl(result.comment.trackKind as SongKind, result.comment.productId, product?.type),
        icon: user.avatarUrl ?? undefined,
        actorId: user.id,
        tag: `comment-like-${id}`,
      });
    }
    return NextResponse.json({ likeCount: Math.max(0, result.likeCount), myVote: value });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
