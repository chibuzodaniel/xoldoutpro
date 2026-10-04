import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { cancelStageRequest, getStageState, leaveStage, requestStage, stageErrorResponse } from "@/lib/live/stage";

// Live co-hosting — see lib/live/stage.ts. GET: the caller's view of the
// stage (who's on it, their own request, and for the host/moderators the
// full watching list and pending requests). POST: the caller acting on
// themselves — ask to come on stage, cancel that, or step off stage.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    return NextResponse.json(await getStageState(id, user.id));
  } catch (err) {
    return handle(err);
  }
}

const bodySchema = z.object({ action: z.enum(["request", "cancel", "leave"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { action } = bodySchema.parse(await req.json());
    if (action === "request") await requestStage(id, user.id);
    else if (action === "cancel") await cancelStageRequest(id, user.id);
    else await leaveStage(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handle(err);
  }
}

function handle(err: unknown) {
  if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const mapped = stageErrorResponse(err);
  if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  console.error(err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}
