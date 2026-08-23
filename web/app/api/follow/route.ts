import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { sendPushToUser } from "@/lib/push/send";

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

    // create() + catch-unique-violation (rather than check-then-upsert) so the
    // "is this a brand new follow" decision is atomic with the insert itself —
    // two concurrent requests racing a check-then-write would otherwise both
    // see "not following yet" and both fire a push for the same follow.
    let isNewFollow = true;
    try {
      await db.follow.create({ data: { followerId: user.id, followedId: targetUserId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        isNewFollow = false;
      } else {
        throw err;
      }
    }
    if (isNewFollow) {
      sendPushToUser(targetUserId, {
        title: "New follower",
        body: `${user.displayName} started following you`,
        url: `/u/${user.handle}`,
        icon: user.avatarUrl ?? undefined,
      });
    }
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
