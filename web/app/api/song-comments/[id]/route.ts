import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { archiveSongComment, type DeletedByRole } from "@/lib/moderation/deletedContent";

// Delete a song comment: its author, the song's creator, or a moderator.
// Deleting a top-level comment takes its replies (and all votes) with it.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const comment = await db.songComment.findUnique({ where: { id }, select: { authorId: true, parentId: true, productId: true } });
    if (!comment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let role: DeletedByRole | null = comment.authorId === user.id ? "OWNER" : user.isModerator ? "MODERATOR" : null;
    if (!role) {
      const product = await db.product.findUnique({ where: { id: comment.productId }, select: { creatorId: true } });
      if (product?.creatorId === user.id) role = "CREATOR";
    }
    if (!role) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const actor = { userId: user.id, role };

    await db.$transaction(async (tx) => {
      // Copy for the admin "Deleted content" panel first (lib/moderation/deletedContent.ts).
      await archiveSongComment(tx, id, actor);
      await tx.songComment.delete({ where: { id } });
      if (comment.parentId) {
        await tx.songComment.updateMany({ where: { id: comment.parentId, replyCount: { gt: 0 } }, data: { replyCount: { decrement: 1 } } });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
