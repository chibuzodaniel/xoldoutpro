import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ optionIndex: z.number().int().min(0) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { optionIndex } = bodySchema.parse(await req.json());

    const poll = await db.poll.findUnique({ where: { postId: id }, include: { post: { select: { groupId: true } } } });
    if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (optionIndex >= poll.options.length) return NextResponse.json({ error: "Invalid option" }, { status: 400 });
    if (poll.post.groupId) {
      const membership = await db.membership.findUnique({
        where: { groupId_userId: { groupId: poll.post.groupId, userId: user.id } },
      });
      if (!membership) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await db.pollVote.upsert({
      where: { pollId_userId: { pollId: id, userId: user.id } },
      update: { optionIndex },
      create: { pollId: id, userId: user.id, optionIndex },
    });

    const votes = await db.pollVote.findMany({ where: { pollId: id } });
    return NextResponse.json({
      counts: poll.options.map((_, i) => votes.filter((v) => v.optionIndex === i).length),
      totalVotes: votes.length,
      myVote: optionIndex,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
