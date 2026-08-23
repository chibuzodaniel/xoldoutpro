import { NextRequest, NextResponse } from "next/server";
import { requireUserAllowDeleted, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const RECOVERY_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

// Reachable by a deleted account specifically to undo its own deletion —
// the one endpoint that uses requireUserAllowDeleted instead of requireUser.
// The client must have signed back in as this exact account first (normal
// Firebase login on /recoveraccount/[handle] — see that page), so the bearer
// token itself is the proof of ownership; no extra confirmation needed here.
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUserAllowDeleted(req);

    if (!user.deletedAt) {
      return NextResponse.json({ error: "This account isn't deleted" }, { status: 400 });
    }

    const deadline = user.deletedAt.getTime() + RECOVERY_WINDOW_MS;
    if (Date.now() > deadline) {
      return NextResponse.json(
        { error: "This account's recovery window has closed. Contact a moderator to restore it." },
        { status: 410 },
      );
    }

    const restored = await db.user.update({ where: { id: user.id }, data: { deletedAt: null } });
    return NextResponse.json({ ok: true, user: restored });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
