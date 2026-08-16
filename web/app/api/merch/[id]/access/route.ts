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

  const entitlement = user
    ? await db.entitlement.findUnique({
        where: { userId_productId: { userId: user.id, productId: id } },
        include: { order: { include: { merchFulfillment: true } } },
      })
    : null;
  const entitled = Boolean(entitlement && !entitlement.revokedAt);
  const fulfillment = entitlement?.order.merchFulfillment ?? null;

  return NextResponse.json({
    entitled,
    isOwner: user ? product.creatorId === user.id : false,
    fulfillment: fulfillment
      ? {
          status: fulfillment.status,
          recipientName: fulfillment.recipientName,
          addressLine1: fulfillment.addressLine1,
          addressLine2: fulfillment.addressLine2,
          city: fulfillment.city,
          state: fulfillment.state,
          country: fulfillment.country,
          shippingFeeKobo: fulfillment.shippingFeeKobo,
          shippedAt: fulfillment.shippedAt,
          trackingInfo: fulfillment.trackingInfo,
        }
      : null,
  });
}
