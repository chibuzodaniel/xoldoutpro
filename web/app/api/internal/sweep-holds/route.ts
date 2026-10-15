import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releaseReservation, releaseConfirmedUnit } from "@/lib/commerce/stock";
import { recordRefund } from "@/lib/commerce/ledger";
import { refundCharge, isRefundUnsupported, creditRefundToWallet } from "@/lib/commerce/claimPayment";
import { createNotification } from "@/lib/notifications/create";
import { reconcilePayout } from "@/lib/commerce/reconcilePayout";
import { sweepExpiredVerifications } from "@/lib/verification/applications";

export const runtime = "nodejs";

const HOLD_MINUTES = 10;

/**
 * PRD §7.2: a failed or abandoned payment releases its stock hold, "hold
 * duration in the order of ten minutes". No persistent worker process runs
 * in this build (see DECISIONS.md) — triggered by vercel.json's cron
 * instead, which invokes via GET and signs requests with CRON_SECRET
 * (Vercel's own convention: an env var of that exact name gets auto-attached
 * as `Authorization: Bearer`).
 *
 * Fixed: the Hobby plan caps Vercel's own crons at once/day, far less often
 * than the ~10-minute target — an abandoned hold could sit for up to 24h
 * instead of ~10min before its stock was released. Rather than wait on a
 * Pro-plan upgrade, a GitHub Actions workflow (.github/workflows/
 * sweep-holds.yml) now hits this same URL every 10 minutes using a second,
 * purpose-built secret (EXTERNAL_CRON_SECRET) — kept separate from
 * CRON_SECRET so Vercel's own daily cron (and its auto-attached bearer
 * token) needed no changes.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const validSecrets = [process.env.CRON_SECRET, process.env.EXTERNAL_CRON_SECRET].filter(Boolean);
  if (!validSecrets.some((secret) => authHeader === `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - HOLD_MINUTES * 60 * 1000);
  const stale = await db.payment.findMany({
    where: { status: "INITIATED", createdAt: { lt: cutoff }, orderId: { not: null } },
    include: { order: { include: { items: true } } },
  });

  let swept = 0;
  for (const payment of stale) {
    if (!payment.orderId || !payment.order) continue;
    const productId = payment.order.items[0]?.productId;
    const quantity = payment.order.items[0]?.quantity ?? 1;
    if (!productId) continue;

    const claim = await db.payment.updateMany({ where: { id: payment.id, status: "INITIATED" }, data: { status: "FAILED" } });
    if (claim.count === 0) continue; // a webhook won the race in the meantime

    await releaseReservation(productId, quantity);
    await db.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    swept += 1;
  }

  // Same abandoned-checkout cleanup as above, for Billboard purchases
  // (lib/commerce/billboards.ts) — without this, a creator who starts a
  // Bachs checkout and never completes it would be permanently blocked from
  // starting a new one (getBlockingBillboardForCreator treats PENDING_PAYMENT
  // as blocking regardless of age).
  const staleBillboardPayments = await db.payment.findMany({
    where: { status: "INITIATED", createdAt: { lt: cutoff }, billboardId: { not: null } },
    select: { id: true, billboardId: true },
  });
  let billboardsSwept = 0;
  for (const payment of staleBillboardPayments) {
    if (!payment.billboardId) continue;
    const claim = await db.payment.updateMany({ where: { id: payment.id, status: "INITIATED" }, data: { status: "FAILED" } });
    if (claim.count === 0) continue; // a webhook won the race in the meantime

    await db.billboard.updateMany({ where: { id: payment.billboardId, status: "PENDING_PAYMENT" }, data: { status: "REMOVED" } });
    billboardsSwept += 1;
  }

  // PRD §7.3: an unclaimed gift expires after a fixed window, "returning the
  // unit and refunding the buyer." Stock decremented at purchase (confirmStock
  // in the checkout/webhook path), so expiry has to reverse both the unit and,
  // for a paid gift, the giver's earnings-side ledger entry — the same
  // recordRefund used by the copyright-takedown path, since this genuinely is
  // a refund event too.
  const expiredGifts = await db.gift.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    include: { order: { include: { payment: true } }, product: { select: { creatorId: true, title: true } } },
  });

  let giftsExpired = 0;
  for (const gift of expiredGifts) {
    const claim = await db.gift.updateMany({ where: { id: gift.id, status: "PENDING" }, data: { status: "EXPIRED" } });
    if (claim.count === 0) continue; // claimed in the meantime

    await releaseConfirmedUnit(gift.productId);
    if (gift.order.payment) {
      await recordRefund(db, { sellerId: gift.product.creatorId, orderId: gift.orderId, grossKobo: gift.order.payment.amountKobo });
      await db.order.update({ where: { id: gift.orderId }, data: { status: "REFUNDED" } });
    }
    // The seller used to find out only by seeing their sold count drop
    // (a creator asked why 17 became 15, 2026-10-15) — tell them, bell + push.
    const debit = await db.walletLedgerEntry.findFirst({
      where: { orderId: gift.orderId, userId: gift.product.creatorId, kind: "REFUND_DEBIT" },
      select: { amountKobo: true },
    });
    await createNotification(gift.product.creatorId, {
      kind: "REFUND",
      title: "Sale reversed",
      body: `A gift of ${gift.product.title} wasn't claimed in time, so the buyer was refunded${
        debit ? ` · ${`₦${(Math.abs(debit.amountKobo) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`} removed from your wallet` : ""
      }.`,
      url: "/wallet",
    });
    giftsExpired += 1;
  }

  const giftsRefunded = await refundExpiredGifts();

  // Self-healing fallback for Bachs's payout.paid/payout.failed webhook
  // never reaching us, platform-wide — app/api/wallet/route.ts already does
  // this same reconcilePayout check, but only for the withdrawing creator's
  // own payouts, and only when they happen to reload their /wallet page
  // afterward. A payout whose webhook silently failed and whose creator
  // never revisits that page stays stuck on PROCESSING forever — invisible
  // as "paid" anywhere, including the moderator Platform Finance panel,
  // even though Bachs's own dashboard already shows it as sent. Checked
  // here too, every ~10 minutes via this same cron, independent of any
  // creator's own activity.
  const inFlightPayouts = await db.payout.findMany({ where: { status: { in: ["PENDING", "PROCESSING"] } } });
  await Promise.allSettled(
    inFlightPayouts.map((payout) =>
      reconcilePayout(payout).catch((err) => console.error("sweep-holds reconcilePayout", payout.id, err)),
    ),
  );

  // Expired IDENTITY verifications (see lib/verification/applications.ts) —
  // an unrelated domain sharing this cron for the same reason gifts do: no
  // persistent worker process exists in this build, and a fourth Hobby-plan
  // cron slot isn't worth spending on something this infrequent.
  const verificationsExpired = await sweepExpiredVerifications();

  return NextResponse.json({ swept, billboardsSwept, payoutsChecked: inFlightPayouts.length, giftsExpired, giftsRefunded, verificationsExpired });
}

const GIFT_REFUNDS_PER_RUN = 20;

/**
 * Sends an expired gift's money back to the buyer through the processor
 * (fixed 2026-10-15). The expiry step above only ever reversed the seller's
 * ledger and marked the order REFUNDED — no processor refund was ever
 * called, so the buyer's money just sat in the platform's Bachs balance
 * while their Library said "Expired, refunded".
 *
 * Gift status now splits the two steps: EXPIRED = expired and the seller
 * side reversed, money not yet returned; REFUNDED = the processor refund
 * went through. Every run retries what's still EXPIRED, which also picks up
 * gifts that expired before this fix. The row is claimed (EXPIRED →
 * REFUNDED) before the external call so two overlapping sweep runs can
 * never refund the same gift twice, and put back to EXPIRED if the call
 * fails so the next run retries it.
 */
async function refundExpiredGifts() {
  const pending = await db.gift.findMany({
    where: { status: "EXPIRED" },
    orderBy: { expiresAt: "asc" },
    take: GIFT_REFUNDS_PER_RUN,
    include: { order: { include: { payment: true } }, product: { select: { title: true } } },
  });

  let refunded = 0;
  for (const gift of pending) {
    const payment = gift.order.payment;
    const amountKobo = payment?.amountKobo ?? 0;
    if (amountKobo > 0 && !payment?.providerTransactionId) {
      console.error(`REFUND NEEDED: expired gift ${gift.id} (order ${gift.orderId}, ${amountKobo} kobo) has no processor transaction id — refund manually.`);
      continue;
    }

    const claim = await db.gift.updateMany({ where: { id: gift.id, status: "EXPIRED" }, data: { status: "REFUNDED" } });
    if (claim.count === 0) continue;

    if (payment && amountKobo > 0) {
      const naira = `₦${(amountKobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
      let toWallet = false;
      try {
        await refundCharge(payment.processor, payment.providerTransactionId!, amountKobo);
      } catch (err) {
        if (!isRefundUnsupported(err)) {
          await db.gift.update({ where: { id: gift.id }, data: { status: "EXPIRED" } });
          console.error(`Expired gift ${gift.id} refund failed — will retry next sweep`, err);
          continue;
        }
        // The processor will never reverse this charge — pay the buyer
        // back into their xoldOut wallet instead (explicit choice).
        await creditRefundToWallet({ userId: gift.giverId, orderId: gift.orderId, amountKobo });
        toWallet = true;
      }
      await createNotification(gift.giverId, {
        kind: "REFUND",
        title: "Gift refunded",
        body: toWallet
          ? `Your gift of ${gift.product.title} wasn't claimed in time · ${naira} refunded to your xoldOut wallet.`
          : `Your gift of ${gift.product.title} wasn't claimed in time · ${naira} refunded to your original payment method.`,
        url: toWallet ? "/wallet" : "/library",
      });
    }
    refunded += 1;
  }
  return refunded;
}
