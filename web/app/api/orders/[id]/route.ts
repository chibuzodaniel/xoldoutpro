import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { requireUser, getOptionalUser, AuthError } from "@/lib/auth/session";
import { adminAuth } from "@/lib/firebase/admin";
import { activatePendingGuest } from "@/lib/commerce/guestCheckout";
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

// How long after checkout a guest's browser can use its order token to sign
// in — plenty for a slow bank transfer, short enough that a leaked token
// stops mattering.
const GUEST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // A guest who checked out with a brand-new email has no session yet
    // (their account only becomes real once they've paid — see
    // User.pendingGuestAt). The return page proves it's the browser that
    // started this checkout with the order's guestAccessToken instead.
    const guestToken = req.headers.get("x-guest-order-token");
    const user = guestToken ? await getOptionalUser(req) : (await requireUser(req)).user;
    let guestCustomToken: string | null = null;
    if (!user) {
      const guestOrder = await db.order.findUnique({ where: { id }, select: { guestAccessToken: true, status: true, buyerId: true, createdAt: true } });
      if (
        !guestOrder?.guestAccessToken ||
        guestOrder.guestAccessToken.length !== guestToken!.length ||
        !timingSafeEqual(Buffer.from(guestOrder.guestAccessToken), Buffer.from(guestToken!)) ||
        Date.now() - guestOrder.createdAt.getTime() > GUEST_TOKEN_TTL_MS
      ) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (guestOrder.status === "PAID") {
        // Normally already done by the payment webhook; this is the retry.
        const activated = await activatePendingGuest(guestOrder.buyerId);
        if (activated && !activated.pendingGuestAt) guestCustomToken = await adminAuth().createCustomToken(activated.firebaseUid);
      }
    }

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
    if (!order || (user && order.buyerId !== user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    // Never echo the guest token itself back.
    const { guestAccessToken: _omit, ...orderOut } = order;
    void _omit;
    return NextResponse.json({ order: orderOut, payment: paymentInfo, entitlements, customToken: guestCustomToken });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
