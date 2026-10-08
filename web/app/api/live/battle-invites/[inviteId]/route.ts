import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { BattleError, getInvite, respondToInvite } from "@/lib/live/battle";

// A battle invite's ring screen (GET) and the Accept / Decline answer (POST)
// — only for the person invited. See lib/live/battle.ts.
export async function GET(req: NextRequest, { params }: { params: Promise<{ inviteId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { inviteId } = await params;
    const invite = await getInvite(inviteId, user.id);
    if (!invite) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ invite });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

const bodySchema = z.object({ accept: z.boolean() });

export async function POST(req: NextRequest, { params }: { params: Promise<{ inviteId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { inviteId } = await params;
    const { accept } = bodySchema.parse(await req.json());
    return NextResponse.json(await respondToInvite(inviteId, user.id, accept));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    if (err instanceof BattleError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
