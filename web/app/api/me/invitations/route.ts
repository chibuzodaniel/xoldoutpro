import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Performance invitations for the signed-in artist (2026-11-11): pending
// first, then answered ones, for events that are still live.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const rows = await db.eventLineupEntry.findMany({
      where: { userId: user.id, event: { status: "PUBLISHED", creatorId: { not: user.id } } },
      orderBy: { addedAt: "desc" },
      take: 100,
      select: {
        role: true,
        status: true,
        addedAt: true,
        event: {
          select: { id: true, title: true, startsAt: true, venue: true, isVirtual: true, coverImageLadder: true, creator: { select: { handle: true, displayName: true } } },
        },
      },
    });
    rows.sort((a, b) => (a.status === "PENDING" ? 0 : 1) - (b.status === "PENDING" ? 0 : 1));
    return NextResponse.json({ invitations: rows });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
