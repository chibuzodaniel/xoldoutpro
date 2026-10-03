import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { sendLiveGift, LiveSessionNotFoundError, LiveSessionEndedError, CannotGiftOwnLiveError, InsufficientCoinsError } from "@/lib/live/spend";

// Matches LiveGiftType/GIFT_CATALOG's keys exactly — hardcoded rather than
// derived from Object.keys(GIFT_CATALOG) so the zod schema stays a proper
// literal-tuple type instead of a widened string[] cast.
const bodySchema = z.object({ giftType: z.enum(["STAR", "MIC", "MONEY_SPRAY", "GRAMMY"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { giftType } = bodySchema.parse(await req.json());

    const gift = await sendLiveGift({ liveSessionId: id, senderId: user.id, giftType });
    return NextResponse.json({ gift }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof LiveSessionNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof LiveSessionEndedError) return NextResponse.json({ error: "This Live has ended" }, { status: 409 });
    if (err instanceof CannotGiftOwnLiveError) return NextResponse.json({ error: "You can't gift your own Live" }, { status: 400 });
    if (err instanceof InsufficientCoinsError) return NextResponse.json({ error: "Not enough XG", insufficientXg: true }, { status: 402 });
    console.error(err);
    return NextResponse.json({ error: "Could not send gift" }, { status: 500 });
  }
}
