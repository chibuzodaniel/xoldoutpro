import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

// Repost / undo repost (Socials v2, design/v2-prototype). A repost is the
// reposter's own Post row (empty body) pointing at the original — one per
// person per post. Followers-only posts can't be reposted.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const original = await db.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, groupId: true, audience: true, repostOfId: true, body: true },
    });
    // Reposting a repost reposts what it points at.
    const target = original?.repostOfId
      ? await db.post.findUnique({ where: { id: original.repostOfId }, select: { id: true, authorId: true, groupId: true, audience: true, repostOfId: true, body: true } })
      : original;
    if (!target || target.groupId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing = await db.post.findUnique({ where: { authorId_repostOfId: { authorId: user.id, repostOfId: target.id } }, select: { id: true } });
    if (existing) {
      await db.$transaction([
        db.postLike.deleteMany({ where: { postId: existing.id } }),
        db.comment.deleteMany({ where: { postId: existing.id } }),
        db.post.delete({ where: { id: existing.id } }),
      ]);
    } else {
      if (target.audience === "FOLLOWERS") return NextResponse.json({ error: "Followers-only posts can't be reposted" }, { status: 400 });
      await db.post.create({ data: { authorId: user.id, body: "", repostOfId: target.id } }).catch(() => null);
      if (target.authorId !== user.id) {
        notifyUsersAfterResponse([target.authorId], {
          kind: "LIKE",
          title: "Your post was reposted",
          body: `${user.displayName} reposted: "${target.body.slice(0, 80)}"`,
          url: "/socials",
          icon: user.avatarUrl ?? undefined,
          tag: `repost-${target.id}`,
        });
      }
    }
    const repostCount = await db.post.count({ where: { repostOfId: target.id } });
    return NextResponse.json({ reposted: !existing, repostCount, originalId: target.id });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
