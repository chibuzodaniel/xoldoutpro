import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

// Only the group's creator promotes/demotes admins — an admin can't grant
// another member admin rights, matching PRD §11's "admin list" being a
// creator-controlled setting, not a member-editable one.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, userId } = await params;
    const { role } = bodySchema.parse(await req.json());

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (group.creatorId !== user.id) return NextResponse.json({ error: "Only the creator can manage admins" }, { status: 403 });
    if (userId === group.creatorId) return NextResponse.json({ error: "The creator is always an admin" }, { status: 400 });

    const updated = await db.membership.update({ where: { groupId_userId: { groupId: id, userId } }, data: { role } });
    return NextResponse.json({ membership: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}

// Creator/admins remove a member; a member can remove themselves (same as leave).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, userId } = await params;

    const group = await db.fanbaseGroup.findUnique({ where: { id } });
    if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (userId === group.creatorId) return NextResponse.json({ error: "Can't remove the creator" }, { status: 400 });

    if (userId !== user.id) {
      const requesterMembership = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } });
      if (requesterMembership?.role !== "ADMIN") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    await db.membership.delete({ where: { groupId_userId: { groupId: id, userId } } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
