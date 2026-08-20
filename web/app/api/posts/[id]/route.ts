import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

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

    await db.$transaction([
      db.pollVote.deleteMany({ where: { poll: { postId: id } } }),
      db.poll.deleteMany({ where: { postId: id } }),
      db.postLike.deleteMany({ where: { postId: id } }),
      db.comment.deleteMany({ where: { postId: id } }),
      db.report.deleteMany({ where: { postId: id } }),
      db.post.updateMany({ where: { replyToId: id }, data: { replyToId: null } }),
      db.post.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
