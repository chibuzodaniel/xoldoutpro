import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ targetUserId: z.string().min(1) });

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const targetUserId = req.nextUrl.searchParams.get("targetUserId");
    if (!targetUserId) return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
    const follow = await db.follow.findUnique({
      where: { followerId_followedId: { followerId: user.id, followedId: targetUserId } },
    });
    return NextResponse.json({ following: Boolean(follow) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { targetUserId } = bodySchema.parse(await req.json());
    if (targetUserId === user.id) return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });

    await db.follow.upsert({
      where: { followerId_followedId: { followerId: user.id, followedId: targetUserId } },
      create: { followerId: user.id, followedId: targetUserId },
      update: {},
    });
    return NextResponse.json({ following: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const targetUserId = req.nextUrl.searchParams.get("targetUserId");
    if (!targetUserId) return NextResponse.json({ error: "targetUserId required" }, { status: 400 });

    await db.follow
      .delete({ where: { followerId_followedId: { followerId: user.id, followedId: targetUserId } } })
      .catch(() => null);
    return NextResponse.json({ following: false });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
