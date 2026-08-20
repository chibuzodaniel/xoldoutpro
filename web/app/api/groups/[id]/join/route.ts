import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push/send";

// PRD §11 Phase 2: OPEN groups join immediately; REQUEST_TO_JOIN groups
// queue a JoinRequest for the creator/admins to approve.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const existing = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
    if (existing) return NextResponse.json({ error: "Already a member" }, { status: 409 });

    if (group.visibility === "OPEN") {
      await db.membership.create({ data: { groupId: id, userId: user.id, role: "MEMBER" } });
      return NextResponse.json({ status: "JOINED" });
    }

    const request = await db.joinRequest.upsert({
      where: { groupId_userId: { groupId: id, userId: user.id } },
      update: { status: "PENDING" },
      create: { groupId: id, userId: user.id },
    });

    const admins = await db.membership.findMany({ where: { groupId: id, role: "ADMIN" }, select: { userId: true } });
    sendPushToUsers(
      admins.map((a) => a.userId),
      { title: "New Fanbase request", body: `${user.displayName} wants to join ${group.name}`, url: `/groups/${id}` },
    );

    return NextResponse.json({ status: request.status });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

// Leave the group (or cancel a pending join request if not yet a member).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (group?.creatorId === user.id) {
      return NextResponse.json({ error: "The creator can't leave their own group" }, { status: 400 });
    }

    await db.membership.delete({ where: { groupId_userId: { groupId: id, userId: user.id } } }).catch(() => null);
    await db.joinRequest.deleteMany({ where: { groupId: id, userId: user.id, status: "PENDING" } });
    return NextResponse.json({ status: "LEFT" });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
