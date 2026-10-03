import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import {
  respondToLiveRequest,
  LiveRequestNotFoundError,
  LiveRequestNotOwnedError,
  LiveRequestNotPendingError,
} from "@/lib/live/spend";

const bodySchema = z.object({ accept: z.boolean() });

// Accept/decline — money already moved at submit time (lib/live/spend.ts's
// submitLiveRequest debits the sender and credits the creator up front,
// same "paid to be seen/considered" shape as a paid DM, not a refundable
// escrow), so this only ever updates status.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { requestId } = await params;
    const { accept } = bodySchema.parse(await req.json());

    const request = await respondToLiveRequest({ requestId, creatorId: user.id, accept });
    return NextResponse.json({ request });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    if (err instanceof LiveRequestNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof LiveRequestNotOwnedError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (err instanceof LiveRequestNotPendingError) return NextResponse.json({ error: "Already responded" }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: "Could not update request" }, { status: 500 });
  }
}
