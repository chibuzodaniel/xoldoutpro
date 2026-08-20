import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendPushToUser } from "@/lib/push/send";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const existing = await db.postLike.findUnique({ where: { postId_userId: { postId: id, userId: user.id } } });
    if (existing) {
      await db.postLike.delete({ where: { postId_userId: { postId: id, userId: user.id } } });
    } else {
      await db.postLike.create({ data: { postId: id, userId: user.id } });
      const post = await db.post.findUnique({ where: { id }, select: { authorId: true } });
      if (post && post.authorId !== user.id) {
        sendPushToUser(post.authorId, { title: "New like", body: `${user.displayName} liked your post`, url: `/socials` });
      }
    }

    const likeCount = await db.postLike.count({ where: { postId: id } });
    return NextResponse.json({ liked: !existing, likeCount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
