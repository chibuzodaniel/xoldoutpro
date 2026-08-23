import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Called when the notifications sheet is opened — marks everything unread
// as read in one shot, same "advance a watermark on open" shape as the
// Socials unread badge, rather than tracking per-item read state from the client.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
