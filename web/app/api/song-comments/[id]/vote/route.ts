import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

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
        tx.songComment.findUnique({ where: { id }, select: { likeCount: true } }),
        tx.songCommentVote.findUnique({ where: key, select: { value: true } }),
      ]);
      if (!comment) return null;
      const old = existing?.value ?? 0;
      if (old === value) return { likeCount: comment.likeCount };

      if (value === 0) await tx.songCommentVote.delete({ where: key });
      else await tx.songCommentVote.upsert({ where: key, create: { commentId: id, userId: user.id, value }, update: { value } });

      const delta = (value === 1 ? 1 : 0) - (old === 1 ? 1 : 0);
      if (!delta) return { likeCount: comment.likeCount };
      const updated = await tx.songComment.update({
        where: { id },
        data: { likeCount: { increment: delta } },
        select: { likeCount: true },
      });
      return { likeCount: updated.likeCount };
    });

    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ likeCount: Math.max(0, result.likeCount), myVote: value });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
