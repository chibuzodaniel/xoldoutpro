import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { reserveStock, confirmStock, releaseReservation } from "@/lib/commerce/stock";
import { initializePayment } from "@/lib/flutterwave";

const bodySchema = z.object({ productId: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    const { user: buyer } = await requireUser(req);
    const { productId } = bodySchema.parse(await req.json());

    const product = await db.product.findUnique({ where: { id: productId }, include: { release: true } });
    if (!product || product.type !== "RELEASE" || product.status !== "PUBLISHED" || !product.release) {
      return NextResponse.json({ error: "Not available" }, { status: 404 });
    }
    if (product.creatorId === buyer.id) {
      return NextResponse.json({ error: "You can't buy your own release" }, { status: 400 });
    }

    const existing = await db.entitlement.findUnique({
      where: { userId_productId: { userId: buyer.id, productId } },
    });
    if (existing && !existing.revokedAt) {
      return NextResponse.json({ error: "You already own this" }, { status: 409 });
    }

    const reservation = await reserveStock(productId);
    if (!reservation.ok) {
      return NextResponse.json({ error: "Sold out" }, { status: 409 });
    }

    // Free releases are a sale at ₦0 (PRD §7.1/§8): no payment processor
    // involved, entitlement granted immediately, still counted as a unit sold.
    if (product.priceKobo === 0) {
      try {
        const order = await db.$transaction(async (tx) => {
          const created = await tx.order.create({
            data: {
              buyerId: buyer.id,
              status: "PAID",
              items: { create: { productId, priceKobo: 0 } },
              entitlements: { create: { userId: buyer.id, productId } },
            },
          });
          await confirmStock(productId, tx);
          return created;
        });
        return NextResponse.json({ free: true, orderId: order.id }, { status: 201 });
      } catch (err) {
        await releaseReservation(productId);
        throw err;
      }
    }

    try {
      const order = await db.order.create({
        data: { buyerId: buyer.id, status: "PENDING", items: { create: { productId, priceKobo: product.priceKobo } } },
      });
      await db.payment.create({
        data: { orderId: order.id, processorRef: order.id, amountKobo: product.priceKobo, status: "INITIATED" },
      });

      const checkoutUrl = await initializePayment({
        txRef: order.id,
        amountKobo: product.priceKobo,
        customerEmail: buyer.email,
        redirectUrl: `${req.nextUrl.origin}/checkout/callback`,
        title: product.title,
      });

      return NextResponse.json({ orderId: order.id, checkoutUrl }, { status: 201 });
    } catch (err) {
      await releaseReservation(productId);
      console.error(err);
      return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
    }
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
