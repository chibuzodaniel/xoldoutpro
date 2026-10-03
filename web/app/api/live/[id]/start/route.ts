import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import {
  startScheduledLiveSession,
  AlreadyLiveError,
  LiveNotScheduledError,
  LiveSessionNotFoundError,
  NotSessionOwnerError,
} from "@/lib/live/sessions";

// The host starts their scheduled Live (creates the room, alerts everyone who
// asked to be reminded plus their followers) — then goes to /broadcast.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const session = await startScheduledLiveSession({ liveSessionId: id, creatorId: user.id });
    return NextResponse.json({ session: { id: session.id, status: session.status } });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LiveSessionNotFoundError || err instanceof NotSessionOwnerError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (err instanceof LiveNotScheduledError) return NextResponse.json({ error: "This Live isn't scheduled any more" }, { status: 409 });
    if (err instanceof AlreadyLiveError) {
      return NextResponse.json(
        { error: "You're already live", activeSession: { id: err.session.id, title: err.session.title, startedAt: err.session.startedAt } },
        { status: 409 },
      );
    }
    console.error(err);
    return NextResponse.json({ error: "Could not start the Live" }, { status: 502 });
  }
}
