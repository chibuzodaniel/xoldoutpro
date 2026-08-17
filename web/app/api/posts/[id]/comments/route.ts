import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Flat comments (PRD §11 Phase 2 "member participation") — reachable on any
// Post, but the only UI that renders them is the group post view; the MVP
// announcement feed stays comment-free per PRD §11 MVP.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = await db.comment.findMany({
    where: { postId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { handle: true, displayName: true, avatarUrl: true } } },
  });
  return NextResponse.json({ comments });
}

const bodySchema = z.object({ body: z.string().trim().min(1).max(500) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { body } = bodySchema.parse(await req.json());

    const post = await db.post.findUnique({ where: { id }, select: { groupId: true } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (post.groupId) {
      const membership = await db.membership.findUnique({ where: { groupId_userId: { groupId: post.groupId, userId: user.id } } });
      if (!membership) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const comment = await db.comment.create({
      data: { postId: id, authorId: user.id, body },
      include: { author: { select: { handle: true, displayName: true, avatarUrl: true } } },
    });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
