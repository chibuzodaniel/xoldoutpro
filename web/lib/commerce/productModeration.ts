import type { CreatorPlan, ProductType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { recordRefund, getCommissionRates } from "@/lib/commerce/ledger";
import { getBuyerPaysFeePercentFor } from "@/lib/commerce/creatorPlans";
import { initiateRefund as initiateFlutterwaveRefund } from "@/lib/flutterwave";
import { initiateRefund as initiateMonnifyRefund } from "@/lib/monnify";
import { initiateRefund as initiateBachsRefund } from "@/lib/bachs";
import { createNotification } from "@/lib/notifications/create";

function formatNaira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

/**
 * The live commission/service-charge percent that actually applies to this
 * product right now, for the moderator dashboard's product list/detail
 * (explicit ask — "check the percentage live for all products"). Whole
 * percent, not a fraction, so it reads the same as every other rate the
 * moderator panel already shows (SiteControlsPanel's inputs). Mirrors
 * computeCreatorPlanCheckout's own per-plan branching (lib/commerce/
 * creatorPlans.ts) but returns the rate itself rather than a checkout
 * amount, and — same fallback as that function — treats a null plan
 * (shouldn't happen on a PUBLISHED product once assertCanPublish is
 * enforced, but a product published before creator plans existed could
 * have one) as UNLIMITED's live rate.
 */
export async function getApplicableCommissionPercent(creatorPlan: CreatorPlan | null, productType: ProductType): Promise<number> {
  if (creatorPlan === "LIMITED") return 0;
  if (creatorPlan === "BUYER_PAYS_FEE") {
    return getBuyerPaysFeePercentFor(productType);
  }
  const rates = await getCommissionRates();
  return Math.round(rates[productType] * 100);
}

/**
 * Withdraws a product from sale/discovery and, unlike a creator's own soft
 * delete (app/api/{releases,beats,merch,events}/[id]/route.ts's DELETE —
 * never refunds, never revokes), reverses every existing buyer's purchase:
 * a real processor refund, a ledger reversal, entitlement revocation, and a
 * notification. Originally the copyright-claim-only branch of
 * app/api/reports/[id]/route.ts's PATCH — extracted here, unchanged, so a
 * moderator can also reach it directly (POST /api/admin/products/[id]/
 * takedown) for any reason, not just a filed report. The report route now
 * calls this instead of inlining it.
 */
export async function takedownProduct(productId: string): Promise<{ refundFailures: { orderId: string; reason: string }[] }> {
  const product = await db.product.findUniqueOrThrow({ where: { id: productId } });
  // Pulling content down can't wait on a payment processor round-trip for
  // every buyer — this happens unconditionally, immediately.
  await db.product.update({ where: { id: product.id }, data: { status: "DELETED", deletedAt: new Date() } });

  const entitlements = await db.entitlement.findMany({
    where: { productId: product.id, revokedAt: null },
    include: { order: { include: { payment: true } } },
  });

  // A ticket/merch group buy creates multiple Entitlement rows for the same
  // Order (one per unit, see schema comment) — grouped back down to one
  // entry per order here, so a 3-ticket order refunds and notifies exactly
  // once, not three times against the same Payment.
  const entitlementsByOrder = new Map<string, typeof entitlements>();
  for (const ent of entitlements) {
    const list = entitlementsByOrder.get(ent.orderId) ?? [];
    list.push(ent);
    entitlementsByOrder.set(ent.orderId, list);
  }

  // The processor refund is a real, hard-to-reverse external effect — it has
  // to happen (and succeed) before the DB ever records a refund, or the
  // ledger can claim money moved that never actually did (the exact gap this
  // wiring closes). Each order is its own atomic step: on failure it's left
  // untouched and reported back instead of the takedown silently lying
  // about it.
  const refundFailures: { orderId: string; reason: string }[] = [];

  for (const [orderId, ents] of entitlementsByOrder) {
    const order = ents[0].order;
    const entitlementIds = ents.map((e) => e.id);

    if (order.status !== "PAID") {
      await db.entitlement.updateMany({ where: { id: { in: entitlementIds } }, data: { revokedAt: new Date() } });
      continue;
    }

    const payment = order.payment;
    if (payment && payment.amountKobo > 0) {
      if (!payment.providerTransactionId) {
        refundFailures.push({ orderId, reason: "No processor transaction on record — refund manually" });
        continue;
      }
      try {
        if (payment.processor === "monnify") {
          await initiateMonnifyRefund(payment.providerTransactionId, payment.amountKobo);
        } else if (payment.processor === "bachs") {
          await initiateBachsRefund(payment.providerTransactionId, payment.amountKobo);
        } else {
          await initiateFlutterwaveRefund(payment.providerTransactionId, payment.amountKobo);
        }
      } catch (err) {
        refundFailures.push({ orderId, reason: err instanceof Error ? err.message : "Refund call failed" });
        continue;
      }
    }

    await db.$transaction(async (tx) => {
      await tx.entitlement.updateMany({ where: { id: { in: entitlementIds } }, data: { revokedAt: new Date() } });
      if (payment) await recordRefund(tx, { sellerId: product.creatorId, orderId, grossKobo: payment.amountKobo });
      await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
    });

    if (payment) {
      await createNotification(order.buyerId, {
        kind: "REFUND",
        title: "Order refunded",
        body: `${product.title} · ${formatNaira(payment.amountKobo)} refunded to your original payment method.`,
        url: "/library",
      });
    }
  }

  return { refundFailures };
}

type AmbassadorCredit = { handle: string; displayName: string; amountKobo: number; role: "buyer-referral" | "seller-referral" };

type OrderBreakdownRow = {
  orderId: string;
  buyerHandle: string;
  buyerDisplayName: string;
  quantity: number;
  amountKobo: number;
  status: string;
  createdAt: Date;
  // A single order can credit up to two ambassadors — one for the buyer's
  // own referral, one for the seller's (recordSale checks both
  // independently, lib/commerce/ledger.ts) — so this is a list, not one.
  ambassadors: AmbassadorCredit[];
  promoter: { handle: string; displayName: string } | null;
};

/**
 * One product's full moderator-facing view: core fields, the creator, live
 * sold/cap, and a per-order breakdown including who (if anyone) was
 * credited as an ambassador or ticket promoter on each sale. No single
 * query does this — assembled from a few raw reads and joined in JS, same
 * style lib/commerce/ledger.ts's getPlatformFinancials already uses.
 * Ambassador attribution shape mirrors that file's
 * getAmbassadorRevenueGeneratedKobo (WalletLedgerEntry.kind ===
 * "AMBASSADOR_COMMISSION" joined through order.items, since an ambassador
 * is attributed to a *person* — User.referredByAmbassadorId — not directly
 * to a sale).
 */
export async function getProductModerationDetail(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      creator: {
        select: { id: true, handle: true, displayName: true, email: true, isVerified: true, creatorPlan: true, referredByAmbassadorId: true },
      },
      stockPolicy: true,
      release: { include: { tracks: true } },
      beat: true,
      merchItem: true,
      ticketTier: { include: { event: { select: { id: true, title: true } } } },
    },
  });
  if (!product) return null;

  const orderItems = await db.orderItem.findMany({
    where: { productId },
    include: {
      order: {
        include: {
          buyer: { select: { handle: true, displayName: true, referredByAmbassadorId: true } },
          payment: { select: { amountKobo: true } },
          promoter: { select: { userId: true } },
        },
      },
    },
    orderBy: { order: { createdAt: "desc" } },
  });

  const orderIds = orderItems.map((oi) => oi.orderId);
  const [ambassadorCredits, promoterUsers] = await Promise.all([
    db.walletLedgerEntry.findMany({
      where: { orderId: { in: orderIds }, kind: "AMBASSADOR_COMMISSION" },
      select: { orderId: true, userId: true, amountKobo: true, user: { select: { handle: true, displayName: true } } },
    }),
    db.user.findMany({
      where: { id: { in: orderItems.map((oi) => oi.order.promoter?.userId).filter((id): id is string => Boolean(id)) } },
      select: { id: true, handle: true, displayName: true },
    }),
  ]);
  const creditsByOrderId = new Map<string, typeof ambassadorCredits>();
  for (const credit of ambassadorCredits) {
    if (!credit.orderId) continue; // can't happen given the `orderId: { in: orderIds }` filter above, just narrowing the nullable schema type
    const list = creditsByOrderId.get(credit.orderId) ?? [];
    list.push(credit);
    creditsByOrderId.set(credit.orderId, list);
  }
  const promoterById = new Map(promoterUsers.map((p) => [p.id, p]));

  const orders: OrderBreakdownRow[] = orderItems.map((oi) => {
    const credits = creditsByOrderId.get(oi.orderId) ?? [];
    const promoterUserId = oi.order.promoter?.userId;
    const promoterUser = promoterUserId ? promoterById.get(promoterUserId) : undefined;
    return {
      orderId: oi.orderId,
      buyerHandle: oi.order.buyer.handle,
      buyerDisplayName: oi.order.buyer.displayName,
      quantity: oi.quantity,
      amountKobo: oi.order.payment?.amountKobo ?? oi.priceKobo * oi.quantity,
      status: oi.order.status,
      createdAt: oi.order.createdAt,
      // Which side's referral earned each credit isn't stored on the
      // ledger row itself — inferred by matching the credited ambassador's
      // id against the seller's (fixed, this product's creator) vs. this
      // order's own buyer's referredByAmbassadorId.
      ambassadors: credits.map((c) => ({
        handle: c.user.handle,
        displayName: c.user.displayName,
        amountKobo: c.amountKobo,
        role: c.userId === product.creator.referredByAmbassadorId ? "seller-referral" : "buyer-referral",
      })),
      promoter: promoterUser ? { handle: promoterUser.handle, displayName: promoterUser.displayName } : null,
    };
  });

  const commissionPercent = await getApplicableCommissionPercent(product.creator.creatorPlan, product.type);

  return {
    product,
    soldCount: product.stockPolicy?.sold ?? 0,
    cap: product.stockPolicy?.cap ?? null,
    orders,
    commissionPercent,
  };
}
