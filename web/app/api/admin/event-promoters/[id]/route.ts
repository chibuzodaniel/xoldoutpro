import { NextRequest, NextResponse } from "next/server";
import { requireModerator, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Moderator removal — mirrors the event owner's own DELETE
// (/api/events/[id]/promoters/[promoterId]) exactly, just without the
// ownership check, for cases the owner won't/can't act on themselves
// (an abusive or fraudulent promoter relationship). Removes future
// attribution only — past ledger entries for already-completed sales are
// immutable, same invariant as the owner-facing route.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModerator(req);
    const { id } = await params;

    const promoter = await db.eventPromoter.findUnique({ where: { id } });
    if (!promoter) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.eventPromoter.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
