import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { setLiveReminder, LiveNotScheduledError, LiveSessionNotFoundError } from "@/lib/live/sessions";

// "Remind me" on a scheduled Live: POST turns it on, DELETE turns it off.
// Everyone reminded gets a push + bell alert the moment it starts.
async function handle(req: NextRequest, params: Promise<{ id: string }>, on: boolean) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const reminderCount = await setLiveReminder({ liveSessionId: id, userId: user.id, on });
    return NextResponse.json({ remindedByMe: on, reminderCount });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LiveSessionNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof LiveNotScheduledError) return NextResponse.json({ error: "This Live isn't scheduled any more" }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, true);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(req, params, false);
}
