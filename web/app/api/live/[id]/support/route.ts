import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getLiveSupport } from "@/lib/live/xgEarnings";
import { getLiveRole } from "@/lib/live/stage";

// The host's supporters list and coin stats for one Live (lib/live/
// xgEarnings.ts's getLiveSupport). Host and that Live's moderators only;
// works after the Live has ended too.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const session = await db.liveSession.findUnique({ where: { id }, select: { id: true, creatorId: true } });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if ((await getLiveRole(session, user.id)) === "viewer") return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    return NextResponse.json(await getLiveSupport(id));
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
