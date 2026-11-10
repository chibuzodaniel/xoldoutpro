import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { getViewer } from "@/lib/communities/server";

// Suspend / restore a member (admins). A suspension keeps the membership and
// any paid time but blocks access until restored. Promote/demote stays on
// /api/groups/[id]/members/[userId] (owner), removing on its DELETE.
const bodySchema = z.object({ action: z.enum(["suspend", "restore"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, userId } = await params;
    const { action } = bodySchema.parse(await req.json());
    const viewer = await getViewer(id, user.id);
    if (!viewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!viewer.isAdmin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
    if (userId === viewer.group.creatorId) return NextResponse.json({ error: "The owner can't be suspended" }, { status: 400 });
    const target = await db.membership.findUnique({ where: { groupId_userId: { groupId: id, userId } }, select: { role: true } });
    if (!target) return NextResponse.json({ error: "Not a member" }, { status: 404 });
    if (target.role === "ADMIN" && !viewer.isOwner) return NextResponse.json({ error: "Only the owner can suspend an admin" }, { status: 403 });

    await db.membership.update({
      where: { groupId_userId: { groupId: id, userId } },
      data: { suspendedAt: action === "suspend" ? new Date() : null },
    });
    notifyUsersAfterResponse([userId], {
      kind: "FANBASE",
      title: action === "suspend" ? "Membership suspended" : "Membership restored",
      body: action === "suspend" ? `An admin suspended your membership in ${viewer.group.name}.` : `Your membership in ${viewer.group.name} is active again.`,
      url: `/groups/${id}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    throw err;
  }
}
