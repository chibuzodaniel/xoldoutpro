import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { startProcessorCheckout, type Gateway } from "@/lib/commerce/processorCheckout";
import { COMMISSION_RATE } from "@/lib/commerce/constants";
import { notifyUsers } from "@/lib/notifications/create";
import { cycleDays, DAY_MS, isMembershipActive } from "@/lib/communities/constants";

// Paid community memberships (v2, design/v2-prototype, 2026-11-09). Same
// Payment/webhook pipeline as catalog subscriptions: a Payment with no Order,
// finalized idempotently by the processor's webhook.

export class MembershipUnavailableError extends Error {}

export async function getMembershipCommissionRate(client: Prisma.TransactionClient | typeof db = db): Promise<number> {
  const row = await client.platformSettings.findUnique({ where: { id: "singleton" }, select: { commissionMembershipPercent: true } });
  return (row?.commissionMembershipPercent ?? Math.round(COMMISSION_RATE * 100)) / 100;
}

/** Members currently on this plan (active ones only) — for capacity checks. */
export async function planMemberCount(planId: string) {
  return db.membership.count({ where: { planId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
}

/** The plan if it's live in this community, with room for one more member (unless they're already on it). */
export async function getJoinablePlan(groupId: string, planId: string, userId: string) {
  const plan = await db.membershipPlan.findFirst({
    where: { id: planId, groupId, archivedAt: null },
    include: { group: { select: { id: true, name: true, creatorId: true } } },
  });
  if (!plan) return null;
  if (plan.capacity != null) {
    const existing = await db.membership.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { planId: true, expiresAt: true } });
    const alreadyOnIt = existing?.planId === plan.id && isMembershipActive(existing);
    if (!alreadyOnIt && (await planMemberCount(plan.id)) >= plan.capacity) throw new MembershipUnavailableError("This plan is full.");
  }
  return plan;
}

export async function startMembershipCheckout(args: {
  member: { id: string; email: string; displayName: string };
  groupId: string;
  planId: string;
  autoRenew: boolean;
  gateway: Gateway;
  origin: string;
}): Promise<{ checkoutUrl: string; paymentRef: string }> {
  const plan = await getJoinablePlan(args.groupId, args.planId, args.member.id);
  if (!plan || plan.priceKobo <= 0) throw new MembershipUnavailableError("This plan isn't available any more");

  const processorRef = `mem-${args.member.id}-${plan.id}-${Date.now()}`;
  await db.payment.create({
    data: {
      membershipUserId: args.member.id,
      membershipGroupId: args.groupId,
      membershipPlanId: plan.id,
      membershipAutoRenew: plan.cycle === "ONE_TIME" ? false : args.autoRenew,
      processor: args.gateway,
      processorRef,
      amountKobo: plan.priceKobo,
      status: "INITIATED",
    },
  });
  const checkoutUrl = await startProcessorCheckout({
    gateway: args.gateway,
    txRef: processorRef,
    amountKobo: plan.priceKobo,
    customerEmail: args.member.email,
    customerName: args.member.displayName,
    redirectUrl: `${args.origin}/communities/callback`,
    title: `XOLDOUT — ${plan.group.name} · ${plan.name}`,
  });
  return { checkoutUrl, paymentRef: processorRef };
}

type PaymentForMembership = {
  id: string;
  processor: string;
  amountKobo: number;
  membershipUserId: string | null;
  membershipGroupId: string | null;
  membershipPlanId: string | null;
  membershipAutoRenew: boolean | null;
};
type VerifiedResult = {
  id: number | string;
  status: "successful" | "failed" | string;
  amountKobo: number;
  cardToken?: string | null;
  customerEmail?: string | null;
};

/**
 * Webhook side of a membership payment: claim the Payment, then on a
 * verified full-amount success create or extend the membership on that plan
 * (a renewal before the end extends from the old end date) and pay the
 * community's owner.
 */
export async function finalizeMembershipPayment(
  payment: PaymentForMembership,
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

  const userId = payment.membershipUserId;
  const groupId = payment.membershipGroupId;
  const planId = payment.membershipPlanId;
  if (!userId || !groupId || !planId || verified.status !== "successful" || verified.amountKobo !== payment.amountKobo) {
    return { alreadyProcessed: false, activated: false };
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mem:${userId}:${groupId}`}))`;
    // The plan as it was paid for — even if it was edited or archived since.
    const plan = await tx.membershipPlan.findUnique({ where: { id: planId }, select: { cycle: true, name: true } });
    const group = await tx.fanbaseGroup.findUnique({ where: { id: groupId }, select: { creatorId: true, name: true } });
    if (!plan || !group) return null;
    const existing = await tx.membership.findUnique({ where: { groupId_userId: { groupId, userId } } });
    const now = Date.now();
    const days = cycleDays(plan.cycle);
    // Same plan, still running: extend from its end. Otherwise start now.
    const extendFrom =
      existing && existing.planId === planId && existing.expiresAt && existing.expiresAt.getTime() > now ? existing.expiresAt.getTime() : now;
    const expiresAt = days ? new Date(extendFrom + days * DAY_MS) : null;
    const autoRenew = days ? (payment.membershipAutoRenew ?? existing?.autoRenew ?? true) : false;
    const card = verified.cardToken
      ? { cardToken: verified.cardToken, cardProcessor: payment.processor, cardEmail: verified.customerEmail ?? existing?.cardEmail ?? null }
      : {};

    await tx.membership.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, role: "MEMBER", planId, expiresAt, autoRenew, ...card },
      update: { planId, expiresAt, autoRenew, renewalNotifiedAt: null, ...card },
    });
    // An approved application is used up once paid for.
    await tx.joinRequest.deleteMany({ where: { groupId, userId, status: "APPROVED" } });

    const owner = await tx.user.findUnique({ where: { id: group.creatorId }, select: { creatorPlan: true } });
    const rate = owner?.creatorPlan === "LIMITED" ? 0 : await getMembershipCommissionRate(tx);
    const commissionKobo = Math.round(payment.amountKobo * rate);
    const base = { userId: group.creatorId, membershipGroupId: groupId, status: "AVAILABLE" as const, availableAt: null };
    await tx.walletLedgerEntry.createMany({
      data: [
        { ...base, amountKobo: payment.amountKobo, kind: "MEMBERSHIP_CREDIT" },
        ...(commissionKobo > 0 ? [{ ...base, amountKobo: -commissionKobo, kind: "MEMBERSHIP_COMMISSION_FEE" as const }] : []),
      ],
    });
    return { ownerId: group.creatorId, groupName: group.name, planName: plan.name, renewed: Boolean(existing && existing.planId === planId), expiresAt };
  });
  if (!result) return { alreadyProcessed: false, activated: false };

  const member = await db.user.findUnique({ where: { id: userId }, select: { displayName: true, avatarUrl: true } });
  await Promise.all([
    notifyUsers([result.ownerId], {
      kind: "SALE",
      title: result.renewed ? "Membership renewed" : "New paid member",
      body: `${member?.displayName ?? "A fan"} ${result.renewed ? "renewed" : "joined"} ${result.groupName} (${result.planName}).`,
      url: `/groups/${groupId}`,
      icon: member?.avatarUrl ?? undefined,
      tag: `mem-${groupId}-${userId}`,
    }),
    notifyUsers([userId], {
      kind: "ORDER_PAID",
      title: result.renewed ? "Membership renewed" : `Welcome to ${result.groupName}`,
      body: result.expiresAt
        ? `Your ${result.planName} membership runs until ${result.expiresAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}.`
        : `You're a ${result.planName} member.`,
      url: `/groups/${groupId}`,
      tag: `mem-${groupId}-${userId}`,
    }),
  ]).catch((err) => console.error("membership notifications failed", err));

  return { alreadyProcessed: false, activated: true };
}
