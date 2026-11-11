import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { lineupSchema, lineupEntriesSchema, validateLineup, setLineup, notifyLineupAdded, lineupOwnerSelect, LineupError } from "@/lib/event/lineup";

// `entries` (with roles, 2026-11-11) or the older bare `userIds`.
const putSchema = z.object({ userIds: lineupSchema.optional(), entries: lineupEntriesSchema.optional() });

/** Owner replaces the event's lineup (order = array order). Only newly added people are notified. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const body = putSchema.parse(await req.json());
    const entries = body.entries ?? (body.userIds ?? []).map((userId) => ({ userId, role: "ARTIST" as const }));

    const event = await db.event.findUnique({ where: { id }, select: { creatorId: true, status: true, title: true } });
    if (!event || event.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (event.status === "DELETED") return NextResponse.json({ error: "Event is deleted" }, { status: 409 });

    await validateLineup(entries);
    const added = await db.$transaction((tx) => setLineup(tx, id, entries, user.id));
    revalidatePath(`/e/${id}`);
    notifyLineupAdded({ eventId: id, title: event.title, organiserId: user.id, organiserName: user.displayName, entries: added });

    const lineup = await db.eventLineupEntry.findMany({ where: { eventId: id }, ...lineupOwnerSelect });
    return NextResponse.json({ lineup });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LineupError) return NextResponse.json({ error: err.message }, { status: 400 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update lineup" }, { status: 500 });
  }
}
