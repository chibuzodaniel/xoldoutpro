import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const order = await db.order.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { select: { id: true, title: true, type: true, ticketTier: { select: { eventId: true } } } } },
        },
      },
    });
    if (!order || order.buyerId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Event purchases get a scannable ticket the moment the order settles —
    // the checkout success screen shows this directly rather than sending
    // the buyer digging through Library for it.
    const entitlements = await db.entitlement.findMany({
      where: { orderId: id },
      include: {
        checkIn: { select: { code: true } },
        product: {
          select: {
            id: true,
            type: true,
            ticketTier: {
              select: {
                name: true,
                event: { select: { title: true, venue: true, isVirtual: true, startsAt: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ order, entitlements });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
