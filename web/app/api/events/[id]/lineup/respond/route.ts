import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";
import { LINEUP_ROLE_LABEL } from "@/lib/event/lineupRules";

// An invited artist accepts or declines performing (2026-11-11). Accepting
// shows them on the event page and puts the event in their profile's Events.
// They can change their answer later (e.g. withdraw); the host is told.
const schema = z.object({ accept: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { accept } = schema.parse(await req.json());
    const entry = await db.eventLineupEntry.findUnique({
      where: { eventId_userId: { eventId: id, userId: user.id } },
      select: { role: true, status: true, event: { select: { title: true, creatorId: true } } },
    });
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const status = accept ? "ACCEPTED" : "DECLINED";
    if (entry.status !== status) {
      await db.eventLineupEntry.update({ where: { eventId_userId: { eventId: id, userId: user.id } }, data: { status, respondedAt: new Date() } });
      revalidatePath(`/e/${id}`);
      revalidatePath(`/u/${user.handle}`);
      notifyUsersAfterResponse([entry.event.creatorId], {
        kind: "COLLABORATION",
        title: accept ? "Performer confirmed" : "Performer declined",
        body: `${user.displayName} ${accept ? "accepted" : "declined"} performing at "${entry.event.title}" as ${LINEUP_ROLE_LABEL[entry.role] ?? "Artist"}.`,
        url: `/e/${id}`,
      });
    }
    return NextResponse.json({ status });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
