import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// An approved promoter picks their own % within the host's range (2026-11-11).
// Applies to sales from now on — each order fixes its commission at checkout.
const schema = z.object({ sharePercent: z.number().int().min(1).max(100) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;
    const { sharePercent } = schema.parse(await req.json());
    const [event, mine] = await Promise.all([
      db.event.findUnique({ where: { id }, select: { promoterMinPercent: true, promoterMaxPercent: true } }),
      db.eventPromoter.findUnique({ where: { eventId_userId: { eventId: id, userId: user.id } } }),
    ]);
    if (!event || !mine) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (sharePercent < event.promoterMinPercent || sharePercent > event.promoterMaxPercent) {
      return NextResponse.json({ error: `Pick between ${event.promoterMinPercent}% and ${event.promoterMaxPercent}%` }, { status: 400 });
    }
    const promoter = await db.eventPromoter.update({ where: { id: mine.id }, data: { sharePercent } });
    return NextResponse.json({ promoter });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    throw err;
  }
}
