import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyTransaction } from "@/lib/flutterwave";
import { confirmStock, releaseReservation } from "@/lib/commerce/stock";
import { recordSale } from "@/lib/commerce/ledger";
import { giftExpiresAt } from "@/lib/commerce/gifts";

export const runtime = "nodejs";

/**
 * Flutterwave webhooks are neither authenticated by IP nor guaranteed
 * exactly-once (PRD §16: "assume they arrive twice or out of order"). The
 * `verif-hash` header only proves the sender knows our shared secret — it is
 * NOT an HMAC over the body — so the webhook body itself is never trusted
 * for amounts/status. Every field used for business logic comes back from
 * `verifyTransaction`, an authoritated server-to-server call to Flutterwave.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("verif-hash");
  const expected = process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH;
  if (!expected || signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const transactionId = body?.data?.id;
  if (!transactionId) return NextResponse.json({ error: "Missing transaction id" }, { status: 400 });

  let verified;
  try {
    verified = await verifyTransaction(transactionId);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Could not verify transaction" }, { status: 502 });
  }

  const payment = await db.payment.findUnique({
    where: { processorRef: verified.txRef },
    include: { order: { include: { items: true } } },
  });
  if (!payment) return NextResponse.json({ error: "Unknown order" }, { status: 404 });

  // Idempotency: only the delivery that wins this conditional update proceeds.
  // Every retry/duplicate after that sees count 0 and no-ops with 200.
  const claim = await db.payment.updateMany({
    where: { id: payment.id, status: "INITIATED" },
    data: { status: verified.status === "successful" ? "SUCCESSFUL" : "FAILED", webhookReceivedAt: new Date(), rawPayload: body },
  });
  if (claim.count === 0) {
    return NextResponse.json({ ok: true, note: "already processed" });
  }

  const productId = payment.order.items[0]?.productId;
  if (!productId) return NextResponse.json({ error: "Order has no items" }, { status: 500 });

  if (verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    await releaseReservation(productId);
    await db.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    return NextResponse.json({ ok: true });
  }

  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } });
    if (payment.order.isGift) {
      // Claiming (not this webhook) is what creates the Entitlement — see
      // PRD §7.3: "stock decrements at purchase, not claim," which is why
      // confirmStock still runs unconditionally below.
      await tx.gift.create({
        data: { productId, giverId: payment.order.buyerId, orderId: payment.orderId, expiresAt: giftExpiresAt() },
      });
    } else {
      const entitlement = await tx.entitlement.create({
        data: { userId: payment.order.buyerId, productId, orderId: payment.orderId },
      });
      if (product.type === "EVENT") {
        await tx.ticketCheckIn.create({ data: { entitlementId: entitlement.id } });
      }
    }
    await confirmStock(productId, tx);
    await recordSale(tx, { sellerId: product.creatorId, orderId: payment.orderId, grossKobo: payment.amountKobo });
  });

  return NextResponse.json({ ok: true });
}
