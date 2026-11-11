import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { archivePostComment, type DeletedByRole } from "@/lib/moderation/deletedContent";

// Delete a post comment: its author, the post's author, a community admin
// (community posts) or a moderator. A top-level comment takes its replies
// with it. Archived first for the admin "Deleted content" panel.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, commentId } = await params;
    const comment = await db.comment.findUnique({
      where: { id: commentId },
      select: { postId: true, authorId: true, parentId: true, post: { select: { authorId: true, groupId: true } } },
    });
    if (!comment || comment.postId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let role: DeletedByRole | null = comment.authorId === user.id ? "OWNER" : comment.post.authorId === user.id ? "CREATOR" : user.isModerator ? "MODERATOR" : null;
    if (!role && comment.post.groupId) {
      const m = await db.membership.findUnique({ where: { groupId_userId: { groupId: comment.post.groupId, userId: user.id } }, select: { role: true } });
      if (m?.role === "ADMIN") role = "COMMUNITY_ADMIN";
    }
    if (!role) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const actor = { userId: user.id, role };

    await db.$transaction(async (tx) => {
      await archivePostComment(tx, commentId, actor);
      await tx.comment.delete({ where: { id: commentId } });
      if (comment.parentId) {
        await tx.comment.updateMany({ where: { id: comment.parentId, replyCount: { gt: 0 } }, data: { replyCount: { decrement: 1 } } });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
