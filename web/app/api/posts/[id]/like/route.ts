import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { sendPushToUser } from "@/lib/push/send";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const existing = await db.postLike.findUnique({ where: { postId_userId: { postId: id, userId: user.id } } });
    if (existing) {
      // Idempotent: a concurrent double-unlike would otherwise throw P2025
      // (record not found) on the loser request.
      await db.postLike.delete({ where: { postId_userId: { postId: id, userId: user.id } } }).catch(() => null);
    } else {
      // create() + catch-unique-violation (rather than trusting the earlier
      // findUnique) so a concurrent double-like can't either 500 the loser
      // request or double-fire the push — same race as /api/follow.
      let isNewLike = true;
      try {
        await db.postLike.create({ data: { postId: id, userId: user.id } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          isNewLike = false;
        } else {
          throw err;
        }
      }
      if (isNewLike) {
        const post = await db.post.findUnique({ where: { id }, select: { authorId: true } });
        if (post && post.authorId !== user.id) {
          sendPushToUser(post.authorId, { title: "New like", body: `${user.displayName} liked your post`, url: `/socials` });
        }
      }
    }

    const likeCount = await db.postLike.count({ where: { postId: id } });
    return NextResponse.json({ liked: !existing, likeCount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
