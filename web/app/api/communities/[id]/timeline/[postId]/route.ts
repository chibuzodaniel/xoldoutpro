import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { timelineViewer, timelineInclude, serializeTimelinePost, adminIdsFor } from "@/lib/communities/timeline";

// One Timeline post: admins pin/unpin and approve/reject submissions; the
// author edits their own text. (Delete: DELETE /api/posts/[id], archived.)
const schema = z.object({
  pinned: z.boolean().optional(),
  decision: z.enum(["APPROVE", "REJECT"]).optional(),
  body: z.string().trim().max(5000).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; postId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, postId } = await params;
    const body = schema.parse(await req.json());
    const [v, post] = await Promise.all([
      timelineViewer(id, user.id),
      db.post.findUnique({ where: { id: postId }, select: { id: true, groupId: true, authorId: true, status: true, body: true, media: true, imageUrl: true } }),
    ]);
    if (!v || !post || post.groupId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if ((body.pinned !== undefined || body.decision) && !v.isAdmin) return NextResponse.json({ error: "Only admins can do that" }, { status: 403 });
    if (body.body !== undefined && post.authorId !== user.id) return NextResponse.json({ error: "You can only edit your own posts" }, { status: 403 });
    const hasMedia = Boolean(post.imageUrl) || (Array.isArray(post.media) && post.media.length > 0);
    if (body.body !== undefined && !body.body && !hasMedia) return NextResponse.json({ error: "A post can't be empty" }, { status: 400 });
    if (body.decision && post.status !== "PENDING") return NextResponse.json({ error: "This post isn't waiting for review" }, { status: 400 });
    if (body.pinned && post.status !== "PUBLISHED") return NextResponse.json({ error: "Only published posts can be pinned" }, { status: 400 });

    const updated = await db.post.update({
      where: { id: postId },
      data: {
        ...(body.pinned !== undefined ? { pinnedAt: body.pinned ? new Date() : null } : {}),
        ...(body.body !== undefined && body.body !== post.body ? { body: body.body, editedAt: new Date() } : {}),
        // An approved post appears at the top of the Timeline, as when it's approved.
        ...(body.decision
          ? {
              status: body.decision === "APPROVE" ? "PUBLISHED" : "REJECTED",
              reviewedAt: new Date(),
              reviewedById: user.id,
              ...(body.decision === "APPROVE" ? { createdAt: new Date() } : {}),
            }
          : {}),
      },
      include: timelineInclude(user.id),
    });

    if (body.decision && post.authorId !== user.id) {
      notifyUsersAfterResponse([post.authorId], {
        kind: "FANBASE",
        title: v.group.name,
        body: body.decision === "APPROVE" ? "Your post was approved and is now on the Timeline." : "Your post wasn't approved by the admins.",
        url: `/groups/${id}${body.decision === "APPROVE" ? `?post=${postId}` : ""}`,
      });
    }
    const adminIds = await adminIdsFor(id, v.group.creatorId);
    return NextResponse.json({ post: serializeTimelinePost(updated, user.id, adminIds) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid change" }, { status: 400 });
    throw err;
  }
}
