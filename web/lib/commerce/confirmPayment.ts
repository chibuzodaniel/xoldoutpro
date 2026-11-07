import { db } from "@/lib/db";
import { confirmStock, releaseReservation, reserveStock } from "@/lib/commerce/stock";
import { claimPaymentForWebhook, refundCharge, isRefundUnsupported, creditRefundToWallet } from "@/lib/commerce/claimPayment";
import { recordSale, recordTip, refundableKobo, getWalletBalances, getCommissionRates, getTipCommissionRate } from "@/lib/commerce/ledger";
import { giftExpiresAt } from "@/lib/commerce/gifts";
import { buildTicketInfo } from "@/lib/commerce/tickets";
import { sendOrderConfirmationEmail, sendPaymentFailedEmail, sendSaleNotificationEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications/create";
import { activatePendingGuest } from "@/lib/commerce/guestCheckout";
import { getRoyaltySplits } from "@/lib/music/collaborators";

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
  order: {
    buyerId: string;
    isGift: boolean;
    promoterId: string | null;
    commissionOverrideKobo: number | null;
    tipKobo: number;
    isTipOnly: boolean;
    items: { productId: string; quantity: number }[];
    buyer: { referredByAmbassadorId: string | null };
  };
};

type VerifiedResult = { id: number | string; status: "successful" | "failed" | string; amountKobo: number };

// A late payment (see claimPaymentForWebhook) for something that sold out
// after the buyer's hold expired. Nothing was ever recorded against the
// order — no entitlement, no ledger entry — so the processor refund is the
// only thing to undo; the order just stays FAILED. A failed refund call is
// logged loudly rather than thrown, since retrying the webhook can't help
// (the payment row is already claimed).
//
// A tip on the same payment is never refunded (explicit ask, 2026-11-07: "a
// tip is a gift given and cannot be returned") — it's paid to the artist as
// normal and only the purchase part goes back to the buyer.
async function refundLateSoldOutPayment(payment: PaymentForConfirm, chargeId: string, productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { title: true, creatorId: true, creator: { select: { creatorPlan: true } } },
  });
  const tipKobo = payment.order.tipKobo;
  const refundKobo = refundableKobo(payment.amountKobo, tipKobo);

  if (tipKobo > 0 && product) {
    await db.$transaction((tx) =>
      recordTip(tx, { sellerId: product.creatorId, orderId: payment.orderId, tipKobo, sellerPlan: product.creator.creatorPlan }),
    );
    await createNotification(product.creatorId, {
      kind: "SALE",
      title: "You got a tip",
      body: `A fan tipped ${formatNaira(tipKobo)} on ${product.title}`,
      url: "/wallet",
    });
  }
  if (refundKobo === 0) return;

  let toWallet = false;
  try {
    await refundCharge(payment.processor, chargeId, refundKobo);
  } catch (err) {
    if (!isRefundUnsupported(err)) {
      console.error(
        `REFUND NEEDED: late payment ${payment.id} (charge ${chargeId}, order ${payment.orderId}, ${refundKobo} kobo, tip of ${tipKobo} kept) — item sold out and the automatic refund failed.`,
        err,
      );
      return;
    }
    // Processor won't reverse this charge — wallet credit instead.
    await creditRefundToWallet({ userId: payment.order.buyerId, orderId: payment.orderId, amountKobo: refundKobo });
    toWallet = true;
  }
  await createNotification(payment.order.buyerId, {
    kind: "REFUND",
    title: "Payment refunded",
    body: `${product?.title ?? "Your item"} sold out before your payment came through · ${formatNaira(refundKobo)} refunded to your ${toWallet ? "xoldOut wallet" : "original payment method"}${tipKobo > 0 ? `. Your ${formatNaira(tipKobo)} tip went to the artist` : ""}.`,
    url: toWallet ? "/wallet" : "/library",
  });
}

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
  const claim = await claimPaymentForWebhook(payment.id, verified, rawPayload);
  if (claim === "alreadyProcessed") return { alreadyProcessed: true };

  const productId = payment.order.items[0]?.productId;
  const quantity = payment.order.items[0]?.quantity ?? 1;
  if (!productId) throw new Error("Order has no items");

  // "Tip artist" button: nothing is bought, so there's no stock to win back
  // or release and no entitlement — just the tip itself.
  if (payment.order.isTipOnly) return finalizeTipOnly(payment, verified, productId);

  // The sweep already released this order's stock hold, so a late success
  // has to win a unit again before it can be treated as a normal sale. If
  // the item sold out in the meantime the buyer gets their money back
  // instead — never a sale past cap.
  if (claim === "late") {
    if (verified.amountKobo !== payment.amountKobo) {
      console.error(
        `Late payment ${payment.id} paid ${verified.amountKobo} kobo against ${payment.amountKobo} expected — order ${payment.orderId} left FAILED, reconcile manually.`,
      );
      return { alreadyProcessed: false, success: false };
    }
    const reserved = await reserveStock(productId, quantity);
    if (!reserved.ok) {
      await refundLateSoldOutPayment(payment, String(verified.id), productId);
      return { alreadyProcessed: false, success: false };
    }
  }

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
  let royaltySplits: { artistId: string; sharePercent: number }[] = [];
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

    // Ticket promoter split (EVENT only) — resolved from the promoterId
    // captured at checkout time (app/api/orders/route.ts, from a
    // `?promo=<code>` link). Looked up here, not trusted from any stale
    // client-supplied value, and only ever applied to a still-existing
    // EventPromoter row for the product actually being sold.
    let promoter: { userId: string; sharePercent: number } | undefined;
    if (payment.order.promoterId) {
      const promoterRow = await tx.eventPromoter.findUnique({ where: { id: payment.order.promoterId } });
      if (promoterRow) promoter = { userId: promoterRow.userId, sharePercent: promoterRow.sharePercent };
    }

    // Featured artists with an accepted royalty split share this sale
    // (ReleaseCollaborator) — read in this same transaction.
    if (product.type === "RELEASE") royaltySplits = await getRoyaltySplits(tx, productId);

    // A tip added at checkout rides the same payment but is not part of the
    // sale — the sale is recorded on the rest, the tip on its own (recordTip).
    await recordSale(tx, {
      sellerId: product.creatorId,
      buyerId: payment.order.buyerId,
      orderId: payment.orderId,
      grossKobo: payment.amountKobo - payment.order.tipKobo,
      productType: product.type,
      promoter,
      buyerReferredByAmbassadorId: payment.order.buyer.referredByAmbassadorId,
      sellerReferredByAmbassadorId: product.creator.referredByAmbassadorId,
      commissionOverrideKobo: payment.order.commissionOverrideKobo,
      royaltySplits,
    });
    await recordTip(tx, {
      sellerId: product.creatorId,
      orderId: payment.orderId,
      tipKobo: payment.order.tipKobo,
      sellerPlan: product.creator.creatorPlan,
    });
  });

  // A guest who checked out with a brand-new email only had a pending
  // placeholder until now — paying is what makes it a real account (Firebase
  // login + "set a password" email). Best-effort: the sale above already
  // stands, and the checkout return page retries this if it failed.
  await activatePendingGuest(payment.order.buyerId).catch((err) =>
    console.error("guest activation after payment failed", payment.order.buyerId, err),
  );

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
    const tipKobo = payment.order.tipKobo;
    const saleKobo = payment.amountKobo - tipKobo;
    await createNotification(product.creatorId, {
      kind: "SALE",
      title: "You made a sale",
      body: `${product.title} · ${formatNaira(saleKobo)}${tipKobo > 0 ? ` + ${formatNaira(tipKobo)} tip` : ""}`,
      url: "/wallet",
    });

    const { availableKobo, pendingKobo } = await getWalletBalances(product.creatorId);
    // Same override precedence as recordSale itself (creator plans,
    // DECISIONS.md) — recomputing from the live rate here would show the
    // wrong net for a LIMITED (0% taken) or BUYER_PAYS_FEE (commission is
    // the buyer's added charge, not a cut of amountKobo) seller.
    let commissionKobo: number;
    if (payment.order.commissionOverrideKobo != null) {
      commissionKobo = payment.order.commissionOverrideKobo;
    } else {
      const rates = await getCommissionRates();
      commissionKobo = Math.round(saleKobo * rates[product.type]);
    }
    const tipRate = tipKobo > 0 && product.creator.creatorPlan !== "LIMITED" ? await getTipCommissionRate() : 0;
    const royaltyKobo = royaltySplits.reduce((sum, s) => sum + Math.round((saleKobo - commissionKobo) * (s.sharePercent / 100)), 0);
    const netKobo = saleKobo - commissionKobo - royaltyKobo + tipKobo - Math.round(tipKobo * tipRate);

    // Tell each featured artist what this sale earned them.
    await Promise.all(
      royaltySplits.map((s) => {
        const shareKobo = Math.round((saleKobo - commissionKobo) * (s.sharePercent / 100));
        if (shareKobo <= 0) return null;
        return createNotification(s.artistId, {
          kind: "SALE",
          title: "Royalty earned",
          body: `${product.title} sold · your ${s.sharePercent}% share: ${formatNaira(shareKobo)}`,
          url: "/profile/collaborations",
        });
      }),
    );
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

// The "Tip artist" button's payment (Order.isTipOnly). A late success (after
// the hold sweep timed the checkout out) is still fine to accept — a tip
// holds no stock, so there's nothing to win back first.
async function finalizeTipOnly(
  payment: PaymentForConfirm,
  verified: VerifiedResult,
  productId: string,
): Promise<{ alreadyProcessed: boolean; success: boolean }> {
  if (verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    if (verified.status === "successful") {
      console.error(`Tip payment ${payment.id} paid ${verified.amountKobo} kobo against ${payment.amountKobo} expected — reconcile manually.`);
    }
    await db.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    return { alreadyProcessed: false, success: false };
  }

  const product = await db.product.findUniqueOrThrow({
    where: { id: productId },
    select: { title: true, creatorId: true, creator: { select: { creatorPlan: true } } },
  });
  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: payment.orderId }, data: { status: "PAID" } });
    await recordTip(tx, {
      sellerId: product.creatorId,
      orderId: payment.orderId,
      tipKobo: payment.amountKobo,
      sellerPlan: product.creator.creatorPlan,
    });
  });

  await activatePendingGuest(payment.order.buyerId).catch((err) =>
    console.error("guest activation after tip failed", payment.order.buyerId, err),
  );

  const buyer = await db.user.findUnique({ where: { id: payment.order.buyerId }, select: { handle: true } });
  await Promise.all([
    createNotification(payment.order.buyerId, {
      kind: "ORDER_PAID",
      title: "Tip sent",
      body: `${formatNaira(payment.amountKobo)} tip for ${product.title}. Thank you for supporting the artist.`,
      url: `/r/${productId}`,
    }),
    createNotification(product.creatorId, {
      kind: "SALE",
      title: "You got a tip",
      body: `@${buyer?.handle ?? "a fan"} tipped ${formatNaira(payment.amountKobo)} on ${product.title}`,
      url: "/wallet",
    }),
  ]);
  return { alreadyProcessed: false, success: true };
}
