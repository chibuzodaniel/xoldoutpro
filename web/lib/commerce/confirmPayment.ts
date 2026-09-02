import { db } from "@/lib/db";
import { confirmStock, releaseReservation } from "@/lib/commerce/stock";
import { recordSale, getWalletBalances, commissionRateFor } from "@/lib/commerce/ledger";
import { giftExpiresAt } from "@/lib/commerce/gifts";
import { buildTicketInfo } from "@/lib/commerce/tickets";
import { sendOrderConfirmationEmail, sendPaymentFailedEmail, sendSaleNotificationEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications/create";

const SITE_URL = "https://www.xoldout.app";

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

// Same per-type routing every browsing surface uses (ProductCard.tsx's
// hrefFor) — duplicated here rather than imported since that one is a
// client component; this is the one server-side spot that needs it, for the
// payment-failed email's "try again" link back to the thing that didn't sell.
function productHref(product: { id: string; type: string; ticketTier: { eventId: string } | null }) {
  if (product.type === "BEAT") return `/b/${product.id}`;
  if (product.type === "MERCH") return `/m/${product.id}`;
  if (product.type === "EVENT" && product.ticketTier) return `/e/${product.ticketTier.eventId}`;
  return `/r/${product.id}`;
}

type PaymentForConfirm = {
  id: string;
  orderId: string;
  amountKobo: number;
  processor: string;
  order: { buyerId: string; isGift: boolean; items: { productId: string; quantity: number }[] };
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
  const quantity = payment.order.items[0]?.quantity ?? 1;
  if (!productId) throw new Error("Order has no items");

  if (verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    await releaseReservation(productId, quantity);
    await db.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });

    const [buyer, failedProduct] = await Promise.all([
      db.user.findUnique({ where: { id: payment.order.buyerId } }),
      db.product.findUnique({ where: { id: productId }, include: { ticketTier: true } }),
    ]);
    if (buyer && failedProduct) {
      void sendPaymentFailedEmail({
        to: buyer.email,
        productTitle: failedProduct.title,
        priceKobo: payment.amountKobo,
        orderId: payment.orderId,
        retryUrl: `${SITE_URL}${productHref(failedProduct)}`,
      }).catch((err) => console.error("payment failed email failed", err));
    }

    return { alreadyProcessed: false, success: false };
  }

  const product = await db.product.findUniqueOrThrow({ where: { id: productId }, include: { creator: true } });

  // Gifts stay quantity 1 (enforced at order-creation time in /api/orders) —
  // a gift is a single item for a single claimant, never a group buy.
  const checkInCodes: string[] = [];
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
      // One Entitlement per unit, not one Entitlement holding a quantity —
      // each ticket needs its own independently-scannable check-in code
      // (explicit ask), and merch has no reason to differ from that same
      // shape (Library already renders a flat list of entitlements, so N
      // rows for N units is exactly right, not a special case to handle).
      for (let i = 0; i < quantity; i++) {
        const entitlement = await tx.entitlement.create({
          data: { userId: payment.order.buyerId, productId, orderId: payment.orderId },
        });
        if (product.type === "EVENT") {
          const checkIn = await tx.ticketCheckIn.create({ data: { entitlementId: entitlement.id } });
          checkInCodes.push(checkIn.code);
        }
      }
    }
    await confirmStock(productId, quantity, tx);
    await recordSale(tx, {
      sellerId: product.creatorId,
      orderId: payment.orderId,
      grossKobo: payment.amountKobo,
      productType: product.type,
    });
  });

  const buyer = await db.user.findUnique({ where: { id: payment.order.buyerId } });

  if (!payment.order.isGift) {
    if (buyer) {
      void sendOrderConfirmationEmail({
        to: buyer.email,
        buyerName: buyer.displayName,
        orderId: payment.orderId,
        productTitle: product.title,
        priceKobo: payment.amountKobo,
        processor: payment.processor,
        tickets: (await Promise.all(checkInCodes.map((code) => buildTicketInfo(productId, code)))).filter((t) => t !== null),
        productType: product.type,
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

    const { availableKobo, pendingKobo } = await getWalletBalances(product.creatorId);
    const netKobo = payment.amountKobo - Math.round(payment.amountKobo * commissionRateFor(product.type));
    void sendSaleNotificationEmail({
      to: product.creator.email,
      productTitle: product.title,
      buyerHandle: buyer?.handle ?? "a fan",
      netAmountKobo: netKobo,
      walletBalanceKobo: availableKobo + pendingKobo,
      walletUrl: `${SITE_URL}/wallet`,
    }).catch((err) => console.error("sale notification email failed", err));
  }

  return { alreadyProcessed: false, success: true };
}
