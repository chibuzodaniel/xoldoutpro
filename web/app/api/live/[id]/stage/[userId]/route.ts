import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import {
  inviteToStage,
  removeFromStage,
  respondToStageRequest,
  setLiveModerator,
  stageErrorResponse,
} from "@/lib/live/stage";

// The host or a moderator acting on someone else in the Live — see
// lib/live/stage.ts, which enforces who may do what (moderator changes are
// host-only).
const bodySchema = z.object({
  action: z.enum(["approve", "decline", "invite", "remove", "make-moderator", "remove-moderator"]),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, userId } = await params;
    const { action } = bodySchema.parse(await req.json());
    const base = { liveSessionId: id, actorId: user.id, targetUserId: userId };

    if (action === "approve" || action === "decline") await respondToStageRequest({ ...base, approve: action === "approve" });
    else if (action === "invite") await inviteToStage(base);
    else if (action === "remove") await removeFromStage(base);
    else await setLiveModerator({ ...base, on: action === "make-moderator" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const mapped = stageErrorResponse(err);
    if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
