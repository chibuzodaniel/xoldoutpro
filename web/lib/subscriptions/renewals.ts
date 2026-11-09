import { db } from "@/lib/db";
import { chargeSavedCard, verifyTransaction } from "@/lib/flutterwave";
import { notifyUsers } from "@/lib/notifications/create";
import { sendSubscriptionRenewalEmail } from "@/lib/email";
import { DAY_MS, durationLabel, RENEWAL_LEAD_DAYS } from "@/lib/subscriptions/plans";
import { finalizeSubscriptionPayment, getOfferedPlan } from "@/lib/subscriptions/payments";

// Daily renewals for catalog subscriptions (v2, 2026-11-09), run from the
// existing daily cron (app/api/internal/notification-reminders) — no new
// cron, no polling. Each subscription with auto-renew on that ends within
// RENEWAL_LEAD_DAYS is handled once per period (renewalNotifiedAt, cleared
// whenever a payment extends it):
//   • saved card (a processor that can re-charge Naira cards — Flutterwave):
//     charge it now; the period extends as soon as the charge is verified.
//   • otherwise (Bachs today): a push + email with a one-tap Renew link.
// If the artist stopped offering that plan, the fan is told when it ends.

const BATCH = 200;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.xoldout.app";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export async function runSubscriptionRenewals(now = Date.now()) {
  const due = await db.catalogSubscription.findMany({
    where: {
      autoRenew: true,
      renewalNotifiedAt: null,
      currentPeriodEnd: { gt: new Date(now), lte: new Date(now + RENEWAL_LEAD_DAYS * DAY_MS) },
    },
    include: {
      creator: { select: { displayName: true, handle: true } },
      subscriber: { select: { email: true, deletedAt: true } },
    },
    take: BATCH,
  });

  let charged = 0;
  let reminded = 0;
  for (const sub of due) {
    // Marked first, so a crash or a second run never charges/reminds twice.
    const mark = await db.catalogSubscription.updateMany({
      where: { id: sub.id, renewalNotifiedAt: null },
      data: { renewalNotifiedAt: new Date(now) },
    });
    if (mark.count === 0 || sub.subscriber.deletedAt) continue;

    const ends = formatDate(sub.currentPeriodEnd);
    const offered = await getOfferedPlan(sub.creatorId, sub.durationDays);
    if (!offered) {
      await notifyUsers([sub.subscriberId], {
        kind: "REMINDER",
        title: "Subscription ending",
        body: `${sub.creator.displayName} no longer offers this subscription. You can keep streaming until ${ends}.`,
        url: "/library?tab=subscriptions",
        tag: `sub-${sub.id}`,
      }).catch((err) => console.error("subscription notice failed", err));
      continue;
    }

    if (sub.cardToken && sub.cardProcessor === "flutterwave" && sub.cardEmail) {
      try {
        const ok = await chargeRenewal(sub, offered.priceKobo);
        if (ok) {
          charged++;
          continue;
        }
      } catch (err) {
        console.error(`automatic renewal failed for subscription ${sub.id}`, err);
      }
      // Card declined or the processor errored: fall back to a reminder.
    }

    const renewUrl = `${APP_URL}/library?tab=subscriptions&renew=${encodeURIComponent(sub.id)}`;
    await Promise.all([
      notifyUsers([sub.subscriberId], {
        kind: "REMINDER",
        title: `Renew ${sub.creator.displayName}`,
        body: `Your catalog subscription ends on ${ends}. Tap to renew (${durationLabel(sub.durationDays)}).`,
        url: `/library?tab=subscriptions&renew=${encodeURIComponent(sub.id)}`,
        tag: `sub-${sub.id}`,
      }),
      sendSubscriptionRenewalEmail({
        to: sub.subscriber.email,
        artistName: sub.creator.displayName,
        endsOn: ends,
        priceKobo: offered.priceKobo,
        planLabel: durationLabel(sub.durationDays),
        renewUrl,
      }),
    ]).catch((err) => console.error("subscription reminder failed", err));
    reminded++;
  }
  return { due: due.length, charged, reminded };
}

/** Charges the saved card for one more period and confirms it straight away. */
async function chargeRenewal(
  sub: { id: string; subscriberId: string; creatorId: string; durationDays: number; cardToken: string | null; cardEmail: string | null; creator: { displayName: string } },
  priceKobo: number,
): Promise<boolean> {
  if (!sub.cardToken || !sub.cardEmail) return false;
  const processorRef = `sub-renew-${sub.id}-${Date.now()}`;
  const payment = await db.payment.create({
    data: {
      subscriptionSubscriberId: sub.subscriberId,
      subscriptionCreatorId: sub.creatorId,
      subscriptionDurationDays: sub.durationDays,
      subscriptionAutoRenew: true,
      processor: "flutterwave",
      processorRef,
      amountKobo: priceKobo,
      status: "INITIATED",
    },
  });
  await db.catalogSubscription.update({ where: { id: sub.id }, data: { lastChargeAttemptAt: new Date() } });
  const charge = await chargeSavedCard({
    token: sub.cardToken,
    email: sub.cardEmail,
    amountKobo: priceKobo,
    txRef: processorRef,
    narration: `XOLDOUT ${sub.creator.displayName} catalog`,
  });
  // Never trust the charge response alone — verify, exactly like a webhook.
  const verified = await verifyTransaction(charge.id);
  if (verified.txRef !== processorRef) return false;
  const result = await finalizeSubscriptionPayment(payment, verified, { automaticRenewal: true, chargeId: charge.id });
  return result.activated;
}
