import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { supportRole, personSelect } from "@/lib/support/tickets";

// XOLDOUT channel team (2026-11-12): the people items can be assigned to.
// Super admins add and remove them; the team list is visible to the team.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const role = await supportRole(user);
    if (!role.isTeam) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const members = await db.supportTeamMember.findMany({ orderBy: { addedAt: "asc" }, select: { addedAt: true, title: true, user: personSelect } });
    return NextResponse.json({ members });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const schema = z.object({ userId: z.string().min(1), title: z.string().trim().max(60).optional() });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    if (!(await supportRole(user)).isSuper) return NextResponse.json({ error: "Only a super admin can add team members" }, { status: 403 });
    const { userId, title } = schema.parse(await req.json());
    const target = await db.user.findFirst({ where: { id: userId, deletedAt: null, pendingGuestAt: null }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    await db.supportTeamMember.upsert({ where: { userId }, create: { userId, addedById: user.id, title: title || null }, update: title ? { title } : {} });
    notifyUsersAfterResponse([userId], { kind: "MODERATION", title: "You're on the XOLDOUT team", body: "You can now be assigned issues and feedback in the XOLDOUT channel.", url: "/support" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Pick someone" }, { status: 400 });
    throw err;
  }
}

// Super admins set a member's job title (shown to users in the channel).
const titleSchema = z.object({ userId: z.string().min(1), title: z.string().trim().max(60) });

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    if (!(await supportRole(user)).isSuper) return NextResponse.json({ error: "Only a super admin can set titles" }, { status: 403 });
    const { userId, title } = titleSchema.parse(await req.json());
    const updated = await db.supportTeamMember.updateMany({ where: { userId }, data: { title: title || null } });
    if (updated.count === 0) return NextResponse.json({ error: "Add them to the team first" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Titles can be up to 60 characters" }, { status: 400 });
    throw err;
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    if (!(await supportRole(user)).isSuper) return NextResponse.json({ error: "Only a super admin can remove team members" }, { status: 403 });
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "Pick someone" }, { status: 400 });
    // Their open items go back to unassigned.
    await db.$transaction([
      db.supportTicket.updateMany({ where: { assigneeId: userId, status: { not: "SOLVED" } }, data: { assigneeId: null } }),
      db.supportTeamMember.deleteMany({ where: { userId } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
