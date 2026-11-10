import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { notifyUsersAfterResponse } from "@/lib/notifications/create";

const patchSchema = z.object({
  status: z.enum(["SHIPPED", "DELIVERED"]),
  trackingInfo: z.string().max(200).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { user } = await requireUser(req);
    const { orderId } = await params;
    const body = patchSchema.parse(await req.json());

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, merchFulfillment: true },
    });
    // Ownership: only the creator of the merch item(s) in this order may
    // update its fulfilment status — never the buyer, never another creator.
    const owns = order?.items.some((i) => i.product.creatorId === user.id && i.product.type === "MERCH");
    if (!order || !owns || !order.merchFulfillment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await db.merchOrderFulfillment.update({
      where: { orderId },
      data: {
        status: body.status,
        trackingInfo: body.trackingInfo,
        shippedAt: body.status === "SHIPPED" && !order.merchFulfillment.shippedAt ? new Date() : order.merchFulfillment.shippedAt,
      },
    });

    // Tell the buyer (explicit ask, 2026-11-10: notifications for everything).
    if (order.merchFulfillment.status !== body.status || (body.trackingInfo && body.trackingInfo !== order.merchFulfillment.trackingInfo)) {
      const title = order.items.find((i) => i.product.type === "MERCH")?.product.title ?? "Your order";
      notifyUsersAfterResponse([order.buyerId], {
        kind: "ORDER_PAID",
        title: body.status === "DELIVERED" ? "Order delivered" : "Your order has shipped",
        body: `${title}${body.status === "SHIPPED" && updated.trackingInfo ? ` · Tracking: ${updated.trackingInfo}` : ""}`,
        url: "/library",
        tag: `order-${orderId}`,
      });
    }

    return NextResponse.json({ fulfillment: updated });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Could not update fulfilment" }, { status: 500 });
  }
}
