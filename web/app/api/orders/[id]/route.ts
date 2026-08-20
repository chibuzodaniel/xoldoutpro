import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Flutterwave's webhook payload includes card brand/last-4 for card payments
// (payment_type: "card") — safe to surface (same info printed on a receipt),
// unlike the rest of rawPayload which isn't returned to the client. Other
// methods (bank transfer, USSD) don't have card details, so this falls back
// to just naming the method.
function derivePaymentMethod(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const data = (rawPayload as { data?: Record<string, unknown> }).data;
  if (!data || typeof data.payment_type !== "string") return null;

  if (data.payment_type === "card" && data.card && typeof data.card === "object") {
    const card = data.card as { last_4digits?: string; type?: string };
    const brand = card.type?.split(" ")[0];
    if (brand && card.last_4digits) return `•••• ${card.last_4digits} ${brand}`;
    return "Card";
  }
  return data.payment_type === "banktransfer" ? "Bank transfer" : data.payment_type.toUpperCase();
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { id } = await params;

    const [order, payment] = await Promise.all([
      db.order.findUnique({
        where: { id },
        include: {
          items: {
            include: { product: { select: { id: true, title: true, type: true, ticketTier: { select: { eventId: true } } } } },
          },
        },
      }),
      db.payment.findUnique({ where: { orderId: id }, select: { processorRef: true, createdAt: true, rawPayload: true } }),
    ]);
    if (!order || order.buyerId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const paymentInfo = payment
      ? { reference: payment.processorRef, date: payment.createdAt, method: derivePaymentMethod(payment.rawPayload) }
      : null;

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

    return NextResponse.json({ order, payment: paymentInfo, entitlements });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
