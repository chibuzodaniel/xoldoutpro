import { db } from "@/lib/db";
import { initializePayment } from "@/lib/bachs";
import type { CreatorPlan, Prisma, ProductType } from "@/generated/prisma/client";

/**
 * Moderator-configurable creator-plan knobs (SiteControlsPanel, PATCH
 * /api/admin/settings) — lazy singleton read, same pattern as
 * lib/commerce/billboards.ts's getBillboardDailyRateKobo().
 */
export async function getCreatorPlanSettings() {
  const row = await db.platformSettings.findUnique({ where: { id: "singleton" } });
  return {
    buyerPaysFeePercent: row?.buyerPaysFeePercent ?? 12,
    // Events get their own separate Buyer-Pays-Fee rate (explicit ask,
    // 2026-09-22) — same reasoning as the UNLIMITED commission table
    // singling out tickets: ticket economics differ from a digital-goods
    // sale. Release/Beat/Merch still share buyerPaysFeePercent above.
    buyerPaysFeeEventPercent: row?.buyerPaysFeeEventPercent ?? 12,
    buyerPaysFeeUploadCap: row?.buyerPaysFeeUploadCap ?? 50,
    buyerPaysFeeSlotPackSize: row?.buyerPaysFeeSlotPackSize ?? 50,
    buyerPaysFeeSlotPackFeeKobo: row?.buyerPaysFeeSlotPackFeeKobo ?? 400_000,
    limitedPlanFeeKobo: row?.limitedPlanFeeKobo ?? 400_000,
    limitedPlanUploadCap: row?.limitedPlanUploadCap ?? 100,
  };
}

/** Which of getCreatorPlanSettings()'s two BUYER_PAYS_FEE rates applies to a given product type. */
export async function getBuyerPaysFeePercentFor(productType: ProductType): Promise<number> {
  const { buyerPaysFeePercent, buyerPaysFeeEventPercent } = await getCreatorPlanSettings();
  return productType === "EVENT" ? buyerPaysFeeEventPercent : buyerPaysFeePercent;
}

/**
 * Turns a base price (priceKobo*quantity + any shipping — same figure
 * app/api/orders/route.ts always computed as `amountKobo`) into what the
 * buyer actually gets charged and what gets snapshotted onto
 * Order.commissionOverrideKobo, given the seller's plan at checkout time.
 * The one place this math happens — both the free-order and paid-order
 * branches in app/api/orders/route.ts call this rather than duplicating it.
 */
export async function computeCreatorPlanCheckout(
  sellerPlan: CreatorPlan | null,
  baseKobo: number,
  productType: ProductType,
): Promise<{ amountKobo: number; commissionOverrideKobo: number | null }> {
  if (sellerPlan === "BUYER_PAYS_FEE") {
    const percent = await getBuyerPaysFeePercentFor(productType);
    const serviceChargeKobo = Math.round((baseKobo * percent) / 100);
    return { amountKobo: baseKobo + serviceChargeKobo, commissionOverrideKobo: serviceChargeKobo };
  }
  if (sellerPlan === "LIMITED") {
    return { amountKobo: baseKobo, commissionOverrideKobo: 0 };
  }
  // UNLIMITED, or a plan somehow unset on an already-published product
  // (shouldn't happen once assertCanPublish is enforced everywhere, but a
  // product published before this feature shipped could have a null-plan
  // creator) — today's live-rate behavior, untouched.
  return { amountKobo: baseKobo, commissionOverrideKobo: null };
}

/**
 * For a product detail page's buyer-facing price breakdown — null unless
 * this seller is on BUYER_PAYS_FEE, in which case it's the percent to show
 * as an added "service charge" before checkout (same rate
 * computeCreatorPlanCheckout actually charges).
 */
export async function getSellerServiceChargePercent(creatorId: string, productType: ProductType): Promise<number | null> {
  const seller = await db.user.findUnique({ where: { id: creatorId }, select: { creatorPlan: true } });
  if (seller?.creatorPlan !== "BUYER_PAYS_FEE") return null;
  return getBuyerPaysFeePercentFor(productType);
}

export class PlanRequiredError extends Error {}
export class UploadCapError extends Error {
  constructor(
    message: string,
    // Distinguishes "switch or renew" (LIMITED) from "buy more storage"
    // (BUYER_PAYS_FEE) so the client can offer the right action.
    public readonly reason: "no_plan" | "limited_upload_cap" | "buyer_pays_fee_storage_full",
  ) {
    super(message);
  }
}

type PublishEligibilityUser = {
  id: string;
  creatorPlan: CreatorPlan | null;
  limitedUploadsUsed: number;
  buyerPaysFeeBonusSlots: number;
};

/**
 * Throws UploadCapError/PlanRequiredError if `user` can't publish
 * `newProductCount` more products right now. Call after requireUser, before
 * creating any Product rows, in every product-creation route (releases,
 * beats, merch, events, event tiers). Event creation makes one Product per
 * ticket tier (DECISIONS.md — app/api/events/route.ts), so
 * `newProductCount` must be the tier count there, not a hardcoded 1.
 */
export async function assertCanPublish(user: PublishEligibilityUser, newProductCount = 1): Promise<void> {
  if (!user.creatorPlan) {
    throw new UploadCapError("Choose a creator plan before publishing.", "no_plan");
  }

  if (user.creatorPlan === "LIMITED") {
    const settings = await getCreatorPlanSettings();
    // Sales are unlimited on this plan (explicit ask, 2026-09-22) — the
    // only reason to switch or renew is running out of upload slots.
    if (user.limitedUploadsUsed + newProductCount > settings.limitedPlanUploadCap) {
      throw new UploadCapError(
        "You've used all of your Limited plan's uploads — switch plans or renew to publish more.",
        "limited_upload_cap",
      );
    }
    return;
  }

  if (user.creatorPlan === "BUYER_PAYS_FEE") {
    const settings = await getCreatorPlanSettings();
    const liveCount = await db.product.count({ where: { creatorId: user.id, status: { not: "DELETED" } } });
    if (liveCount + newProductCount > settings.buyerPaysFeeUploadCap + user.buyerPaysFeeBonusSlots) {
      throw new UploadCapError(
        "You've filled your available upload storage — buy more slots to publish more.",
        "buyer_pays_fee_storage_full",
      );
    }
  }
  // UNLIMITED: never blocked.
}

/** Call after the product(s) are actually created — no-ops off LIMITED. */
export async function recordProductsPublished(userId: string, count: number): Promise<void> {
  await db.user.updateMany({
    where: { id: userId, creatorPlan: "LIMITED" },
    data: { limitedUploadsUsed: { increment: count } },
  });
}

/**
 * Free, instant switch — no payment involved (explicit ask: creators can
 * move between plans freely, any direction, any time, including offering it
 * again from the publish flow even when a plan is already set).
 */
export async function setCreatorPlan(userId: string, plan: "UNLIMITED" | "BUYER_PAYS_FEE") {
  return db.user.update({ where: { id: userId }, data: { creatorPlan: plan } });
}

type CheckoutResult =
  | { mode: "wallet" }
  | { mode: "bachs"; checkoutUrl: string };

/**
 * Debits the wallet immediately if it covers the cost, otherwise starts a
 * real Bachs checkout — same wallet-first-then-Bachs shape as
 * lib/commerce/billboards.ts's createBillboardCheckout, and the same
 * advisory-lock technique (there's no mutable balance row to lock).
 *
 * Shared by both LIMITED join/renewal and a BUYER_PAYS_FEE slot-pack
 * purchase — `applyOnSuccess` is what actually differs between the two (the
 * User-row update to make once payment is confirmed), passed in by the
 * caller so this function stays payment-plumbing-only.
 */
async function chargeCreatorPlanFee(args: {
  userId: string;
  amountKobo: number;
  paymentKind: "LIMITED_ACTIVATION" | "SLOT_PACK";
  origin: string;
  customerEmail: string;
  customerName: string;
  checkoutTitle: string;
  applyOnSuccess: (tx: Prisma.TransactionClient, userId: string) => Promise<void>;
}): Promise<CheckoutResult> {
  const walletCovered = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${args.userId}))`;

    const available = await tx.walletLedgerEntry.aggregate({
      where: { userId: args.userId, OR: [{ availableAt: null }, { availableAt: { lte: new Date() } }] },
      _sum: { amountKobo: true },
    });
    const availableKobo = available._sum.amountKobo ?? 0;
    if (availableKobo < args.amountKobo) return false;

    await tx.walletLedgerEntry.create({
      data: { userId: args.userId, amountKobo: -args.amountKobo, kind: "CREATOR_PLAN_FEE", status: "AVAILABLE" },
    });
    await args.applyOnSuccess(tx, args.userId);
    return true;
  });

  if (walletCovered) return { mode: "wallet" };

  const payment = await db.payment.create({
    data: {
      creatorPlanUserId: args.userId,
      creatorPlanPaymentKind: args.paymentKind,
      processor: "bachs",
      processorRef: `plan-${args.paymentKind.toLowerCase()}-${args.userId}-${Date.now()}`,
      amountKobo: args.amountKobo,
      status: "INITIATED",
    },
  });
  const checkoutUrl = await initializePayment({
    txRef: payment.processorRef,
    amountKobo: args.amountKobo,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    redirectUrl: `${args.origin}/plan/checkout-callback`,
    title: args.checkoutTitle,
  });
  return { mode: "bachs", checkoutUrl };
}

export async function activateOrRenewLimitedPlan(args: {
  userId: string;
  origin: string;
  customerEmail: string;
  customerName: string;
}): Promise<CheckoutResult> {
  const settings = await getCreatorPlanSettings();
  return chargeCreatorPlanFee({
    userId: args.userId,
    amountKobo: settings.limitedPlanFeeKobo,
    paymentKind: "LIMITED_ACTIVATION",
    origin: args.origin,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    checkoutTitle: "XOLDOUT Limited plan",
    applyOnSuccess: async (tx, userId) => {
      await tx.user.update({
        where: { id: userId },
        data: { creatorPlan: "LIMITED", limitedUploadsUsed: 0, limitedPlanActivatedAt: new Date() },
      });
    },
  });
}

export async function buyBuyerPaysFeeSlotPack(args: {
  userId: string;
  origin: string;
  customerEmail: string;
  customerName: string;
}): Promise<CheckoutResult> {
  const settings = await getCreatorPlanSettings();
  return chargeCreatorPlanFee({
    userId: args.userId,
    amountKobo: settings.buyerPaysFeeSlotPackFeeKobo,
    paymentKind: "SLOT_PACK",
    origin: args.origin,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    checkoutTitle: `XOLDOUT +${settings.buyerPaysFeeSlotPackSize} upload slots`,
    applyOnSuccess: async (tx, userId) => {
      await tx.user.update({
        where: { id: userId },
        data: { buyerPaysFeeBonusSlots: { increment: settings.buyerPaysFeeSlotPackSize } },
      });
    },
  });
}

type PaymentForCreatorPlan = {
  id: string;
  creatorPlanUserId: string | null;
  creatorPlanPaymentKind: string | null;
  amountKobo: number;
};
type VerifiedResult = { id: number | string; status: "successful" | "failed" | string; amountKobo: number };

/**
 * Sibling of lib/commerce/billboards.ts's finalizeBillboardPayment / lib/
 * commerce/confirmPayment.ts's finalizePayment, for the creator-plan branch
 * of the same Bachs webhook dispatch. A failed/amount-mismatched payment
 * just leaves the User row untouched — there's no PENDING state to roll
 * back to, unlike a Billboard.
 */
export async function finalizeCreatorPlanFeePayment(
  payment: PaymentForCreatorPlan,
  verified: VerifiedResult,
  rawPayload: unknown,
): Promise<{ alreadyProcessed: boolean }> {
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

  if (!payment.creatorPlanUserId || verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    return { alreadyProcessed: false };
  }

  if (payment.creatorPlanPaymentKind === "LIMITED_ACTIVATION") {
    await db.user.update({
      where: { id: payment.creatorPlanUserId },
      data: { creatorPlan: "LIMITED", limitedUploadsUsed: 0, limitedPlanActivatedAt: new Date() },
    });
  } else if (payment.creatorPlanPaymentKind === "SLOT_PACK") {
    const settings = await getCreatorPlanSettings();
    await db.user.update({
      where: { id: payment.creatorPlanUserId },
      data: { buyerPaysFeeBonusSlots: { increment: settings.buyerPaysFeeSlotPackSize } },
    });
  }

  return { alreadyProcessed: false };
}
