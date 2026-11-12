import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { supportRole, ticketInclude, shapeTicket, personSelect, isIgnored, SUPPORT_STATUSES } from "@/lib/support/tickets";

// One item in the XOLDOUT channel. The sender and the team see it in full
// with its replies; anyone else only once it's solved, without the sender or
// the conversation.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const role = await supportRole(user);
    const t = await db.supportTicket.findUnique({ where: { id }, include: ticketInclude });
    const shaped = t ? shapeTicket(t, user.id, role.isTeam) : null;
    if (!t || !shaped) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const full = role.isTeam || t.authorId === user.id;
    const [replies, team] = await Promise.all([
      full ? db.supportReply.findMany({ where: { ticketId: id }, orderBy: { createdAt: "asc" }, select: { id: true, body: true, createdAt: true, author: personSelect } }) : [],
      role.isSuper ? db.supportTeamMember.findMany({ select: { user: personSelect } }) : [],
    ]);
    const teamIds = new Set(team.map((m) => m.user.id));
    return NextResponse.json({
      ticket: shaped,
      replies: replies.map((r) => ({ ...r, fromTeam: r.author.id !== t.authorId })),
      role,
      // Super admins pick the assignee from the team.
      team: role.isSuper ? [...team.map((m) => m.user), ...(teamIds.has(user.id) ? [] : [{ id: user.id, handle: user.handle, displayName: user.displayName, avatarUrl: user.avatarUrl }])] : [],
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

const patchSchema = z.object({
  status: z.enum(SUPPORT_STATUSES).optional(),
  assigneeId: z.string().min(1).nullable().optional(),
  // Team member takes it on themself (2026-11-12): any unassigned item, or
  // one that looks ignored (no update for 2 days) even if someone has it.
  pickUp: z.literal(true).optional(),
});

// Team: change status. Super admin: also assign (to a team member or themself).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const role = await supportRole(user);
    if (!role.isTeam) return NextResponse.json({ error: "Only the XOLDOUT team can do that" }, { status: 403 });
    const t = await db.supportTicket.findUnique({ where: { id }, select: { authorId: true, title: true, status: true, assigneeId: true, updatedAt: true, createdAt: true } });
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (body.pickUp) {
      if (t.status === "SOLVED") return NextResponse.json({ error: "This is already solved" }, { status: 400 });
      if (t.assigneeId === user.id) return NextResponse.json({ error: "It's already yours" }, { status: 400 });
      if (t.assigneeId && !role.isSuper && !isIgnored(t)) return NextResponse.json({ error: "Someone is already on this. You can take it over if it goes 2 days without an update." }, { status: 409 });
      body.assigneeId = user.id;
    }

    if (body.assigneeId !== undefined && !body.pickUp && !role.isSuper) return NextResponse.json({ error: "Only a super admin can assign others" }, { status: 403 });
    if (body.assigneeId) {
      const ok =
        body.assigneeId === user.id ||
        (await db.supportTeamMember.findUnique({ where: { userId: body.assigneeId }, select: { userId: true } })) ||
        (await db.user.findFirst({ where: { id: body.assigneeId, isSuperModerator: true }, select: { id: true } }));
      if (!ok) return NextResponse.json({ error: "Add them to the team first" }, { status: 400 });
    }

    const updated = await db.supportTicket.update({
      where: { id },
      data: {
        ...(body.status ? { status: body.status, solvedAt: body.status === "SOLVED" ? new Date() : null } : {}),
        ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId, ...(body.assigneeId && t.status === "OPEN" && !body.status ? { status: "IN_PROGRESS" } : {}) } : {}),
      },
      include: ticketInclude,
    });

    // Taken over from someone: let them know.
    if (body.pickUp && t.assigneeId && t.assigneeId !== user.id) {
      notifyUsersAfterResponse([t.assigneeId], { kind: "MODERATION", title: "Item taken over", body: `${user.displayName} took over: ${t.title}`, url: `/support?t=${id}` });
    }
    if (body.assigneeId && body.assigneeId !== t.assigneeId && body.assigneeId !== user.id) {
      notifyUsersAfterResponse([body.assigneeId], { kind: "MODERATION", title: "Assigned to you", body: t.title, url: `/support?t=${id}` });
    }
    if (updated.status !== t.status && t.authorId !== user.id) {
      notifyUsersAfterResponse([t.authorId], {
        kind: "COMMENT",
        title: updated.status === "SOLVED" ? "Your feedback was solved" : "Update on your feedback",
        body: `${t.title} — ${updated.status === "SOLVED" ? "Solved" : updated.status === "IN_PROGRESS" ? "In progress" : "Open"}${updated.assignee ? ` · ${updated.assignee.displayName}` : ""}`,
        url: `/support?t=${id}`,
      });
    }
    return NextResponse.json({ ticket: shapeTicket(updated, user.id, true) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid change" }, { status: 400 });
    throw err;
  }
}
