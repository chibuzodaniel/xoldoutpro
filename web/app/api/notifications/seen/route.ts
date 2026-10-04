import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Called when the bell / Notifications screen opens (explicit ask,
// 2026-10-04): everything currently there counts as seen, which clears the
// bell badge. It does not mark anything read — each notification keeps its
// unread styling until it's opened or its merged group is expanded.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    await db.notification.updateMany({ where: { userId: user.id, seenAt: null }, data: { seenAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
