import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Per-notification read state (explicit ask, 2026-10-04: "once a
// notification has been viewed it should display differently so the user
// will know it has been checked"). Opening the bell no longer marks
// everything read — the client sends the ids the user actually opened.
// No body (or no ids) marks everything read: the sheet's "Mark all as read".
const bodySchema = z.object({ ids: z.array(z.string()).max(200).optional() }).optional();

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const raw = await req.text();
    const body = bodySchema.parse(raw ? JSON.parse(raw) : undefined);
    const ids = body?.ids;

    await db.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      // Opening a notification also counts as seeing it.
      data: { readAt: new Date(), seenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError || err instanceof SyntaxError) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    throw err;
  }
}
