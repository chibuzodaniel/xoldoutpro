import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const bodySchema = z.object({ code: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireUser(req);
    const { code } = bodySchema.parse(await req.json());

    const checkIn = await db.ticketCheckIn.findUnique({
      where: { code },
      include: {
        entitlement: {
          include: { product: { include: { ticketTier: { include: { event: true } } } }, user: { select: { displayName: true, handle: true } } },
        },
      },
    });
    const event = checkIn?.entitlement.product.ticketTier?.event;
    // Only the event's own creator may scan tickets into it — never the
    // buyer, never another creator's staff.
    if (!checkIn || !event || event.creatorId !== user.id) {
      return NextResponse.json({ error: "Invalid ticket" }, { status: 404 });
    }
    if (checkIn.checkedInAt) {
      return NextResponse.json({ error: "Already checked in", checkedInAt: checkIn.checkedInAt }, { status: 409 });
    }

    await db.ticketCheckIn.update({
      where: { code },
      data: { checkedInAt: new Date(), checkedInBy: user.id },
    });

    return NextResponse.json({
      ok: true,
      tierName: checkIn.entitlement.product.ticketTier?.name,
      buyer: checkIn.entitlement.user.displayName,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not check in ticket" }, { status: 500 });
  }
}
