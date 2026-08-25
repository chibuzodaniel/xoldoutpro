import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { checkSalesMilestone } from "@/lib/verification/eligibility";

// GET: does the client-side modal need to show the "you've hit 50 sales"
// nudge right now? POST: mark it shown (idempotent — the modal calls this
// once, right after rendering, so it never re-triggers on a later visit).
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const result = await checkSalesMilestone(user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    await db.user.update({ where: { id: user.id }, data: { salesMilestoneNotifiedAt: new Date() } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
