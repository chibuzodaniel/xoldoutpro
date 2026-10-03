import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getLiveSessionSummary } from "@/lib/live/sessions";

// Creator-only — the write-up's §5 "Live summary" card. Available while
// still live too (a running tally), not just after End live.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const session = await db.liveSession.findUnique({ where: { id } });
    if (!session || session.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const summary = await getLiveSessionSummary(id);
    return NextResponse.json({ session, summary });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
