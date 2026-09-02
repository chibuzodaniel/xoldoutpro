import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/session";
import { db } from "@/lib/db";

// Public browsing info — served to signed-out visitors too (entitled/isOwner
// default false, no fulfillment). Only /api/orders (the actual purchase)
// requires a signed-in user.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser(req);
  const { id } = await params;

  const product = await db.product.findUnique({ where: { id }, include: { merchItem: true } });
  if (!product || !product.merchItem) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A quantity>1 order creates one Entitlement per unit (see schema comment),
  // all sharing that order's single MerchOrderFulfillment — grouped back down
  // to one row per *order* here (not per unit) since that's what the buyer
  // actually sees: one package, one shipping status, however many units it holds.
  const entitlements = user
    ? await db.entitlement.findMany({
        where: { userId: user.id, productId: id, revokedAt: null },
        include: { order: { include: { merchFulfillment: true, items: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const fulfillmentsByOrderId = new Map<string, (typeof entitlements)[number]>();
  for (const ent of entitlements) fulfillmentsByOrderId.set(ent.orderId, ent);

  const fulfillments = Array.from(fulfillmentsByOrderId.values()).map((ent) => {
    const f = ent.order.merchFulfillment;
    const quantity = ent.order.items.find((i) => i.productId === id)?.quantity ?? 1;
    return {
      quantity,
      status: f?.status ?? null,
      recipientName: f?.recipientName ?? null,
      addressLine1: f?.addressLine1 ?? null,
      addressLine2: f?.addressLine2 ?? null,
      city: f?.city ?? null,
      state: f?.state ?? null,
      country: f?.country ?? null,
      shippingFeeKobo: f?.shippingFeeKobo ?? 0,
      shippedAt: f?.shippedAt ?? null,
      trackingInfo: f?.trackingInfo ?? null,
    };
  });

  return NextResponse.json({
    entitled: entitlements.length > 0,
    isOwner: user ? product.creatorId === user.id : false,
    fulfillments,
  });
}
