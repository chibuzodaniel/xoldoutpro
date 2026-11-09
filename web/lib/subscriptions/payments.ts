import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { startProcessorCheckout, type Gateway } from "@/lib/commerce/processorCheckout";
import { COMMISSION_RATE } from "@/lib/commerce/constants";
import { notifyUsers } from "@/lib/notifications/create";
import { DAY_MS, durationLabel, SUBSCRIPTION_DAYS } from "@/lib/subscriptions/plans";

// Catalog subscriptions (v2, design/v2-prototype, 2026-11-09) — paying for
// a period and what a successful payment does. Same Payment/webhook pipeline
// as XG top-ups (a Payment with no Order): the processor's webhook calls
// finalizeSubscriptionPayment, which is idempotent on the Payment row.

export class SubscriptionUnavailableError extends Error {}

/** Platform cut of a subscription payment (PlatformSettings.commissionSubscriptionPercent). */
export async function getSubscriptionCommissionRate(client: Prisma.TransactionClient | typeof db = db): Promise<number> {
  const row = await client.platformSettings.findUnique({ where: { id: "singleton" }, select: { commissionSubscriptionPercent: true } });
  return (row?.commissionSubscriptionPercent ?? Math.round(COMMISSION_RATE * 100)) / 100;
}

/** Whether this listener can stream this artist's full catalog right now. One indexed row. */
export async function hasActiveSubscription(userId: string | null | undefined, creatorId: string): Promise<boolean> {
  if (!userId || userId === creatorId) return false;
  const sub = await db.catalogSubscription.findUnique({
    where: { subscriberId_creatorId: { subscriberId: userId, creatorId } },
    select: { currentPeriodEnd: true },
  });
  return Boolean(sub && sub.currentPeriodEnd.getTime() > Date.now());
}

/** The artist's live plan for this duration, or null if they don't offer it (any more). */
export async function getOfferedPlan(creatorId: string, durationDays: number) {
  if (!SUBSCRIPTION_DAYS.includes(durationDays)) return null;
  const creator = await db.user.findUnique({
    where: { id: creatorId },
    select: {
      id: true,
      displayName: true,
      handle: true,
      deletedAt: true,
      catalogSubscriptionOn: true,
      subscriptionPlans: { where: { durationDays }, select: { priceKobo: true } },
    },
  });
  const plan = creator?.subscriptionPlans[0];
  if (!creator || creator.deletedAt || !creator.catalogSubscriptionOn || !plan) return null;
  return { creator, priceKobo: plan.priceKobo, durationDays };
}

/** Starts a processor checkout for one period of this artist's catalog. */
export async function startSubscriptionCheckout(args: {
  subscriber: { id: string; email: string; displayName: string };
  creatorId: string;
  durationDays: number;
  autoRenew: boolean;
  gateway: Gateway;
  origin: string;
}): Promise<{ checkoutUrl: string; paymentRef: string }> {
  if (args.subscriber.id === args.creatorId) throw new SubscriptionUnavailableError("You can't subscribe to yourself");
  const offered = await getOfferedPlan(args.creatorId, args.durationDays);
  if (!offered) throw new SubscriptionUnavailableError("This subscription isn't available any more");

  const processorRef = `sub-${args.subscriber.id}-${args.creatorId}-${Date.now()}`;
  await db.payment.create({
    data: {
      subscriptionSubscriberId: args.subscriber.id,
      subscriptionCreatorId: args.creatorId,
      subscriptionDurationDays: args.durationDays,
      subscriptionAutoRenew: args.autoRenew,
      processor: args.gateway,
      processorRef,
      amountKobo: offered.priceKobo,
      status: "INITIATED",
    },
  });
  const checkoutUrl = await startProcessorCheckout({
    gateway: args.gateway,
    txRef: processorRef,
    amountKobo: offered.priceKobo,
    customerEmail: args.subscriber.email,
    customerName: args.subscriber.displayName,
    redirectUrl: `${args.origin}/subscriptions/callback`,
    title: `XOLDOUT — ${offered.creator.displayName} catalog · ${durationLabel(args.durationDays)}`,
  });
  return { checkoutUrl, paymentRef: processorRef };
}

type PaymentForSubscription = {
  id: string;
  processor: string;
  amountKobo: number;
  subscriptionSubscriberId: string | null;
  subscriptionCreatorId: string | null;
  subscriptionDurationDays: number | null;
  subscriptionAutoRenew: boolean | null;
};
type VerifiedResult = {
  id: number | string;
  status: "successful" | "failed" | string;
  amountKobo: number;
  cardToken?: string | null;
  customerEmail?: string | null;
};

/**
 * Webhook side of a subscription payment. Claims the Payment (so a repeated
 * webhook does nothing), then — on a verified, full-amount success — creates
 * or extends the CatalogSubscription and pays the artist. A renewal paid
 * before the end extends from the old end date, so no days are lost.
 */
export async function finalizeSubscriptionPayment(
  payment: PaymentForSubscription,
  verified: VerifiedResult,
  rawPayload: unknown,
): Promise<{ alreadyProcessed: boolean; activated: boolean }> {
  const claim = await db.payment.updateMany({
    where: { id: payment.id, status: "INITIATED" },
    data: {
      status: verified.status === "successful" ? "SUCCESSFUL" : "FAILED",
      webhookReceivedAt: new Date(),
      rawPayload: rawPayload as never,
      providerTransactionId: String(verified.id),
    },
  });
  if (claim.count === 0) return { alreadyProcessed: true, activated: false };

  const subscriberId = payment.subscriptionSubscriberId;
  const creatorId = payment.subscriptionCreatorId;
  const days = payment.subscriptionDurationDays;
  if (!subscriberId || !creatorId || !days || verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    return { alreadyProcessed: false, activated: false };
  }

  const { subscription, renewed } = await db.$transaction(async (tx) => {
    // Two payments for the same fan + artist can't both read the old end date.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sub:${subscriberId}:${creatorId}`}))`;
    const existing = await tx.catalogSubscription.findUnique({ where: { subscriberId_creatorId: { subscriberId, creatorId } } });
    const now = Date.now();
    const stillActive = Boolean(existing && existing.currentPeriodEnd.getTime() > now);
    const base = stillActive && existing ? existing.currentPeriodEnd.getTime() : now;
    const currentPeriodEnd = new Date(base + days * DAY_MS);
    const autoRenew = payment.subscriptionAutoRenew ?? existing?.autoRenew ?? true;
    // A processor that can re-charge the card (Flutterwave) hands back a token.
    const card = verified.cardToken
      ? { cardToken: verified.cardToken, cardProcessor: payment.processor, cardEmail: verified.customerEmail ?? existing?.cardEmail ?? null }
      : {};

    const sub = await tx.catalogSubscription.upsert({
      where: { subscriberId_creatorId: { subscriberId, creatorId } },
      create: { subscriberId, creatorId, durationDays: days, priceKobo: payment.amountKobo, currentPeriodEnd, autoRenew, ...card },
      update: {
        durationDays: days,
        priceKobo: payment.amountKobo,
        currentPeriodEnd,
        autoRenew,
        renewalNotifiedAt: null,
        ...(stillActive ? {} : { startedAt: new Date(now) }),
        ...card,
      },
    });

    const creator = await tx.user.findUnique({ where: { id: creatorId }, select: { creatorPlan: true } });
    const rate = creator?.creatorPlan === "LIMITED" ? 0 : await getSubscriptionCommissionRate(tx);
    const commissionKobo = Math.round(payment.amountKobo * rate);
    const base2 = { userId: creatorId, subscriptionId: sub.id, status: "AVAILABLE" as const, availableAt: null };
    await tx.walletLedgerEntry.createMany({
      data: [
        { ...base2, amountKobo: payment.amountKobo, kind: "SUBSCRIPTION_CREDIT" },
        ...(commissionKobo > 0 ? [{ ...base2, amountKobo: -commissionKobo, kind: "SUBSCRIPTION_COMMISSION_FEE" as const }] : []),
      ],
    });
    return { subscription: sub, renewed: Boolean(existing) };
  });

  const [subscriber, creator] = await Promise.all([
    db.user.findUnique({ where: { id: subscriberId }, select: { displayName: true, avatarUrl: true } }),
    db.user.findUnique({ where: { id: creatorId }, select: { displayName: true, handle: true } }),
  ]);
  const ends = subscription.currentPeriodEnd.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
  await Promise.all([
    notifyUsers([creatorId], {
      kind: "SALE",
      title: renewed ? "Subscription renewed" : "New catalog subscriber",
      body: `${subscriber?.displayName ?? "A fan"} ${renewed ? "renewed" : "subscribed to"} your catalog (${durationLabel(days)}).`,
      url: "/wallet",
      icon: subscriber?.avatarUrl ?? undefined,
      tag: `sub-${subscription.id}`,
    }),
    notifyUsers([subscriberId], {
      kind: "ORDER_PAID",
      title: renewed ? "Subscription renewed" : "You're subscribed",
      body: `You can stream ${creator?.displayName ?? "this artist"}'s full catalog until ${ends}.`,
      url: "/library?tab=subscriptions",
      tag: `sub-${subscription.id}`,
    }),
  ]).catch((err) => console.error("subscription notifications failed", err));

  return { alreadyProcessed: false, activated: true };
}
