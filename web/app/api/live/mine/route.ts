import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { getActiveLiveSessionForCreator } from "@/lib/live/sessions";

// The caller's own currently-running Live, if any — the Go Live form checks
// this first so a creator who's already live gets "Continue / End & start
// new" instead of a dead-end "You're already live" error.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const session = await getActiveLiveSessionForCreator(user.id);
    return NextResponse.json({
      session: session ? { id: session.id, title: session.title, startedAt: session.startedAt } : null,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
