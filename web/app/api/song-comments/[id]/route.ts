import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Delete a song comment: its author, the song's creator, or a moderator.
// Deleting a top-level comment takes its replies (and all votes) with it.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const comment = await db.songComment.findUnique({ where: { id }, select: { authorId: true, parentId: true, productId: true } });
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let allowed = comment.authorId === user.id || user.isModerator;
    if (!allowed) {
      const product = await db.product.findUnique({ where: { id: comment.productId }, select: { creatorId: true } });
      allowed = product?.creatorId === user.id;
    }
    if (!allowed) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

    await db.$transaction([
      db.songComment.delete({ where: { id } }),
      ...(comment.parentId
        ? [db.songComment.updateMany({ where: { id: comment.parentId, replyCount: { gt: 0 } }, data: { replyCount: { decrement: 1 } } })]
        : []),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
