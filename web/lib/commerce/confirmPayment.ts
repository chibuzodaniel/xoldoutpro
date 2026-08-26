import { db } from "@/lib/db";
import { confirmStock, releaseReservation } from "@/lib/commerce/stock";
import { recordSale } from "@/lib/commerce/ledger";
import { giftExpiresAt } from "@/lib/commerce/gifts";
import { buildTicketInfo } from "@/lib/commerce/tickets";
import { sendOrderConfirmationEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications/create";

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

type PaymentForConfirm = {
  id: string;
  orderId: string;
  amountKobo: number;
  order: { buyerId: string; isGift: boolean; items: { productId: string }[] };
};

type VerifiedResult = { id: number | string; status: "successful" | "failed" | string; amountKobo: number };

/**
 * Shared by every processor's webhook (Flutterwave, Monnify, ...) once each
 * has done its own authoritative server-to-server verification — see
 * lib/flutterwave.ts / lib/monnify.ts's verifyTransaction. This function
 * never trusts the raw webhook body itself for amounts/status (PRD §16:
 * "assume they arrive twice or out of order"), only `verified`.
 *
 * Extracted out of the Flutterwave webhook route so a second processor
 * doesn't duplicate this — order→PAID, entitlement/gift creation, stock
 * confirm, ledger record, confirmation email, and both buyer/seller
 * notifications — which has nothing processor-specific in it.
 */
export async function finalizePayment(
  payment: PaymentForConfirm,
  verified: VerifiedResult,
  rawPayload: unknown,
): Promise<{ alreadyProcessed: boolean; success?: boolean }> {
  // Idempotency: only the delivery that wins this conditional update
  // proceeds. Every retry/duplicate after that sees count 0 and no-ops.
  const claim = await db.payment.updateMany({
    where: { id: payment.id, status: "INITIATED" },
    data: {
      status: verified.status === "successful" ? "SUCCESSFUL" : "FAILED",
      webhookReceivedAt: new Date(),
      rawPayload: rawPayload as never,
      providerTransactionId: String(verified.id),
    },
  });
  if (claim.count === 0) return { alreadyProcessed: true };

  const productId = payment.order.items[0]?.productId;
  if (!productId) throw new Error("Order has no items");

  if (verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    await releaseReservation(productId);
    await db.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    return { alreadyProcessed: false, success: false };
  }

  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });

  let checkInCode: string | null = null;
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
        const checkIn = await tx.ticketCheckIn.create({ data: { entitlementId: entitlement.id } });
        checkInCode = checkIn.code;
      }
    }
    await confirmStock(productId, tx);
    await recordSale(tx, { sellerId: product.creatorId, orderId: payment.orderId, grossKobo: payment.amountKobo });
  });

  if (!payment.order.isGift) {
    const buyer = await db.user.findUnique({ where: { id: payment.order.buyerId } });
    if (buyer) {
      void sendOrderConfirmationEmail({
        to: buyer.email,
        buyerName: buyer.displayName,
        orderId: payment.orderId,
        productTitle: product.title,
        priceKobo: payment.amountKobo,
        ticket: checkInCode ? await buildTicketInfo(productId, checkInCode) : null,
      }).catch((err) => console.error("order confirmation email failed", err));
    }
    await createNotification(payment.order.buyerId, {
      kind: "ORDER_PAID",
      title: "Order confirmed",
      body: `${product.title} · ${formatNaira(payment.amountKobo)}`,
      url: "/library",
    });
  }

  if (product.creatorId !== payment.order.buyerId) {
    await createNotification(product.creatorId, {
      kind: "SALE",
      title: "You made a sale",
      body: `${product.title} · ${formatNaira(payment.amountKobo)}`,
      url: "/wallet",
    });
  }

  return { alreadyProcessed: false, success: true };
}
