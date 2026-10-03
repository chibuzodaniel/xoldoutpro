import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import {
  buyLiveAccess,
  LiveSessionNotFoundError,
  LiveSessionEndedError,
  LiveAccessNotPaidError,
  AlreadyHasAccessError,
} from "@/lib/live/spend";
import { InsufficientCoinsError } from "@/lib/live/coins";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const grant = await buyLiveAccess({ liveSessionId: id, userId: user.id });
    return NextResponse.json({ ok: true, grant }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof LiveSessionNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof LiveSessionEndedError) return NextResponse.json({ error: "This Live has ended" }, { status: 409 });
    if (err instanceof LiveAccessNotPaidError) return NextResponse.json({ error: "This Live is free to join" }, { status: 400 });
    if (err instanceof AlreadyHasAccessError) return NextResponse.json({ ok: true }, { status: 200 });
    if (err instanceof InsufficientCoinsError) return NextResponse.json({ error: "Not enough XG", insufficientXg: true }, { status: 402 });
    console.error(err);
    return NextResponse.json({ error: "Could not buy access" }, { status: 500 });
  }
}
