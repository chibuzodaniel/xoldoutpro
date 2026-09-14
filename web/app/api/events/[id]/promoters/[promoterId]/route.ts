import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Removes future attribution only — past WalletLedgerEntry rows for
// already-completed sales are immutable and untouched (same "the ledger
// never gets rewritten" invariant as everywhere else in lib/commerce).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; promoterId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, promoterId } = await params;

    const event = await db.event.findUnique({ where: { id } });
    if (!event || event.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const promoter = await db.eventPromoter.findUnique({ where: { id: promoterId } });
    if (!promoter || promoter.eventId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.eventPromoter.delete({ where: { id: promoterId } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
