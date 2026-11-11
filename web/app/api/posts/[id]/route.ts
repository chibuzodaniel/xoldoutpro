import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { archivePost } from "@/lib/moderation/deletedContent";

// Deletes a Post — a Socials feed announcement (groupId null) or a Fanbase
// group chat message (groupId set). The author can always delete their own;
// a group ADMIN can additionally delete any message in their own group
// (moderation), matching the same admin/creator authority already used for
// join-request approval and member management.
//
// No onDelete: Cascade in the schema (deliberate — a hard FK stops an
// accidental delete from silently wiping dependents), so likes/comments/poll
// votes/reports are cleaned up explicitly here, and replies quoting this
// post are orphaned (replyToId -> null) rather than deleted, so the rest of
// a thread doesn't vanish just because the message it quoted did.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const post = await db.post.findUnique({ where: { id }, select: { authorId: true, groupId: true } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let canDelete = post.authorId === user.id;
    if (!canDelete && post.groupId) {
      const membership = await db.membership.findUnique({
        where: { groupId_userId: { groupId: post.groupId, userId: user.id } },
      });
      canDelete = membership?.role === "ADMIN";
    }
    if (!canDelete) return NextResponse.json({ error: "You can't delete this" }, { status: 403 });

    // Reposts of this post go with it (Socials v2).
    const repostIds = (await db.post.findMany({ where: { repostOfId: id }, select: { id: true } })).map((r) => r.id);
    await db.$transaction(async (tx) => {
      // Copy for the admin "Deleted content" panel first (lib/moderation/deletedContent.ts).
      await archivePost(tx, id, { userId: user.id, role: post.authorId === user.id ? "OWNER" : "COMMUNITY_ADMIN" });
      await tx.postLike.deleteMany({ where: { postId: { in: repostIds } } });
      await tx.comment.deleteMany({ where: { postId: { in: repostIds } } });
      await tx.report.deleteMany({ where: { postId: { in: repostIds } } });
      await tx.post.deleteMany({ where: { id: { in: repostIds } } });
      await tx.pollVote.deleteMany({ where: { poll: { postId: id } } });
      await tx.poll.deleteMany({ where: { postId: id } });
      await tx.postLike.deleteMany({ where: { postId: id } });
      await tx.comment.deleteMany({ where: { postId: id } });
      await tx.report.deleteMany({ where: { postId: id } });
      await tx.post.updateMany({ where: { replyToId: id }, data: { replyToId: null } });
      await tx.post.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
