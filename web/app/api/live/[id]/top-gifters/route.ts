import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getTopGifters } from "@/lib/live/xgEarnings";

// Public gift leaderboard for a Live (lib/live/xgEarnings.ts's
// getTopGifters) — anyone signed in can read it; only gift XG, no Naira.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser(req);
    const { id } = await params;
    const exists = await db.liveSession.count({ where: { id } });
    if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ gifters: await getTopGifters(id) });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
