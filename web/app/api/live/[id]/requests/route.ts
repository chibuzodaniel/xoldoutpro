import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  submitLiveRequest,
  LiveSessionNotFoundError,
  LiveSessionEndedError,
  CannotGiftOwnLiveError,
  InsufficientCoinsError,
} from "@/lib/live/spend";

// Creator's own moderation queue — every request regardless of status, so
// they can see what they already accepted/declined this session, not just
// what's still pending.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const session = await db.liveSession.findUnique({ where: { id } });
    if (!session || session.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requests = await db.liveRequest.findMany({
      where: { liveSessionId: id },
      include: { sender: { select: { handle: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ requests });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const bodySchema = z.object({ message: z.string().min(1).max(500), xgAmount: z.number().int().min(10) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { message, xgAmount } = bodySchema.parse(await req.json());

    const request = await submitLiveRequest({ liveSessionId: id, senderId: user.id, message, xgAmount });
    return NextResponse.json({ request }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof LiveSessionNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof LiveSessionEndedError) return NextResponse.json({ error: "This Live has ended" }, { status: 409 });
    if (err instanceof CannotGiftOwnLiveError) return NextResponse.json({ error: "You can't send yourself a request" }, { status: 400 });
    if (err instanceof InsufficientCoinsError) return NextResponse.json({ error: "Not enough XG", insufficientXg: true }, { status: 402 });
    console.error(err);
    return NextResponse.json({ error: "Could not send request" }, { status: 500 });
  }
}
