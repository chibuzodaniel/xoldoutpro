import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { endLiveSession, getLiveSessionSummary, LiveSessionNotFoundError, NotSessionOwnerError, LiveSessionAlreadyEndedError } from "@/lib/live/sessions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    await endLiveSession({ liveSessionId: id, creatorId: user.id });
    const summary = await getLiveSessionSummary(id);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LiveSessionNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof NotSessionOwnerError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof LiveSessionAlreadyEndedError) return NextResponse.json({ error: "Already ended" }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "Could not end live" }, { status: 500 });
  }
}
