import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { supportRole, personSelect } from "@/lib/support/tickets";

// The conversation on an item: its sender and the XOLDOUT team only.
const schema = z.object({ body: z.string().trim().min(1).max(2000) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { body } = schema.parse(await req.json());
    const [role, t] = await Promise.all([supportRole(user), db.supportTicket.findUnique({ where: { id }, select: { authorId: true, assigneeId: true, title: true } })]);
    if (!t || (!role.isTeam && t.authorId !== user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const reply = await db.supportReply.create({
      data: { ticketId: id, authorId: user.id, body },
      select: { id: true, body: true, createdAt: true, author: personSelect },
    });
    await db.supportTicket.update({ where: { id }, data: { updatedAt: new Date() } });

    // Team replies reach the sender; the sender's replies reach the assignee.
    const to = user.id === t.authorId ? (t.assigneeId ? [t.assigneeId] : []) : [t.authorId];
    notifyUsersAfterResponse(
      to.filter((x) => x !== user.id),
      { kind: user.id === t.authorId ? "MODERATION" : "COMMENT", title: user.id === t.authorId ? "New reply on an assigned item" : "XOLDOUT replied to your feedback", body: `${t.title}: ${body.slice(0, 100)}`, url: `/support?t=${id}` },
    );
    return NextResponse.json({ reply: { ...reply, fromTeam: user.id !== t.authorId } }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Write a reply" }, { status: 400 });
    throw err;
  }
}
