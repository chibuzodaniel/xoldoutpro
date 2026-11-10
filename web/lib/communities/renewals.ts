import { db } from "@/lib/db";
import { chargeSavedCard, verifyTransaction } from "@/lib/flutterwave";
import { notifyUsers } from "@/lib/notifications/create";
import { DAY_MS } from "@/lib/communities/constants";
import { finalizeMembershipPayment } from "@/lib/communities/payments";

// Daily renewals for paid community memberships (v2, 2026-11-09) — the same
// rules as catalog subscriptions (lib/subscriptions/renewals.ts), run from
// the same daily cron: once per period, a saved Flutterwave card is charged;
// otherwise the member gets a reminder with a one-tap renew.

const LEAD_DAYS = 3;
const BATCH = 200;

function formatDate(d: Date) {
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export async function runMembershipRenewals(now = Date.now()) {
  const due = await db.membership.findMany({
    where: {
      autoRenew: true,
      renewalNotifiedAt: null,
      suspendedAt: null,
      planId: { not: null },
      expiresAt: { gt: new Date(now), lte: new Date(now + LEAD_DAYS * DAY_MS) },
    },
    include: { group: { select: { name: true } }, user: { select: { deletedAt: true } } },
    take: BATCH,
  });

  let charged = 0;
  let reminded = 0;
  for (const m of due) {
    const mark = await db.membership.updateMany({
      where: { groupId: m.groupId, userId: m.userId, renewalNotifiedAt: null },
      data: { renewalNotifiedAt: new Date(now) },
    });
    if (mark.count === 0 || m.user.deletedAt || !m.expiresAt || !m.planId) continue;

    const plan = await db.membershipPlan.findFirst({ where: { id: m.planId, archivedAt: null }, select: { id: true, name: true, priceKobo: true, cycle: true } });
    const ends = formatDate(m.expiresAt);
    if (!plan || plan.priceKobo <= 0 || plan.cycle === "ONE_TIME") {
      await notifyUsers([m.userId], {
        kind: "REMINDER",
        title: "Membership ending",
        body: `Your ${m.group.name} membership ends on ${ends}. That plan isn't offered any more — pick another from the community.`,
        url: `/groups/${m.groupId}`,
        tag: `mem-${m.groupId}-${m.userId}`,
      }).catch((err) => console.error("membership notice failed", err));
      continue;
    }

    if (m.cardToken && m.cardProcessor === "flutterwave" && m.cardEmail) {
      try {
        const processorRef = `mem-renew-${m.userId}-${plan.id}-${Date.now()}`;
        const payment = await db.payment.create({
          data: {
            membershipUserId: m.userId,
            membershipGroupId: m.groupId,
            membershipPlanId: plan.id,
            membershipAutoRenew: true,
            processor: "flutterwave",
            processorRef,
            amountKobo: plan.priceKobo,
            status: "INITIATED",
          },
        });
        const charge = await chargeSavedCard({
          token: m.cardToken,
          email: m.cardEmail,
          amountKobo: plan.priceKobo,
          txRef: processorRef,
          narration: `XOLDOUT ${m.group.name} membership`,
        });
        const verified = await verifyTransaction(charge.id);
        if (verified.txRef === processorRef && (await finalizeMembershipPayment(payment, verified, { automaticRenewal: true })).activated) {
          charged++;
          continue;
        }
      } catch (err) {
        console.error(`automatic membership renewal failed for ${m.groupId}/${m.userId}`, err);
      }
    }

    await notifyUsers([m.userId], {
      kind: "REMINDER",
      title: `Renew ${m.group.name}`,
      body: `Your ${plan.name} membership ends on ${ends}. Tap to renew.`,
      url: `/groups/${m.groupId}?renew=1`,
      tag: `mem-${m.groupId}-${m.userId}`,
    }).catch((err) => console.error("membership reminder failed", err));
    reminded++;
  }
  return { due: due.length, charged, reminded };
}
