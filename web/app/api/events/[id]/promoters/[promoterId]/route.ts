import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { z } from "zod";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

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

// Host approves or rejects an application, or sets a promoter's % (2026-11-11).
const patchSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]).optional(), sharePercent: z.number().int().min(1).max(100).optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; promoterId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id, promoterId } = await params;
    const body = patchSchema.parse(await req.json());
    const event = await db.event.findUnique({ where: { id }, select: { creatorId: true, title: true } });
    if (!event || event.creatorId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const promoter = await db.eventPromoter.findUnique({ where: { id: promoterId } });
    if (!promoter || promoter.eventId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await db.eventPromoter.update({
      where: { id: promoterId },
      data: {
        ...(body.status ? { status: body.status, decidedAt: new Date() } : {}),
        ...(body.sharePercent ? { sharePercent: body.sharePercent } : {}),
      },
    });
    if (body.status && body.status !== promoter.status) {
      notifyUsersAfterResponse([promoter.userId], {
        kind: "COLLABORATION",
        title: body.status === "APPROVED" ? "You're a promoter" : "Promoter application",
        body:
          body.status === "APPROVED"
            ? `You're approved to promote "${event.title}". Share your link to earn on every ticket.`
            : `Your application to promote "${event.title}" wasn't approved this time.`,
        url: `/e/${id}`,
      });
    }
    return NextResponse.json({ promoter: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
