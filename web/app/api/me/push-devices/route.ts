import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Most recent device tokens kept per user — plenty for phone + laptop +
// tablet, while stale browser tokens age out on their own (dead ones are
// also pruned by lib/push/send.ts when the push service rejects them).
const MAX_DEVICES = 10;

const bodySchema = z.object({ token: z.string().min(10).max(4096) });

// Registers ONE device for push and turns push on (explicit ask: push on by
// default). Adds to User.fcmTokens instead of replacing it — the old
// PATCH /api/me { fcmTokens: [token] } path overwrote the whole list, so
// enabling push on a laptop silently unregistered the phone (and vice
// versa) and each user only ever got pushes on one device.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { token } = bodySchema.parse(await req.json());

    const current = await db.user.findUnique({ where: { id: user.id }, select: { fcmTokens: true } });
    const tokens = [...(current?.fcmTokens ?? []).filter((t) => t !== token), token].slice(-MAX_DEVICES);
    await db.user.update({ where: { id: user.id }, data: { pushEnabled: true, fcmTokens: tokens } });

    return NextResponse.json({ ok: true, devices: tokens.length });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not register this device" }, { status: 500 });
  }
}
