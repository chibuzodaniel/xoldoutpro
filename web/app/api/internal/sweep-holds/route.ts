import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releaseReservation, releaseConfirmedUnit } from "@/lib/commerce/stock";
import { recordRefund } from "@/lib/commerce/ledger";
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
    where: { status: "INITIATED", createdAt: { lt: cutoff } },
    include: { order: { include: { items: true } } },
  });

  let swept = 0;
  for (const payment of stale) {
    const productId = payment.order.items[0]?.productId;
    if (!productId) continue;

    const claim = await db.payment.updateMany({ where: { id: payment.id, status: "INITIATED" }, data: { status: "FAILED" } });
    if (claim.count === 0) continue; // a webhook won the race in the meantime

    await releaseReservation(productId);
    await db.order.update({ where: { id: payment.orderId }, data: { status: "FAILED" } });
    swept += 1;
  }

  // PRD §7.3: an unclaimed gift expires after a fixed window, "returning the
  // unit and refunding the buyer." Stock decremented at purchase (confirmStock
  // in the checkout/webhook path), so expiry has to reverse both the unit and,
  // for a paid gift, the giver's earnings-side ledger entry — the same
  // recordRefund used by the copyright-takedown path, since this genuinely is
  // a refund event too.
  const expiredGifts = await db.gift.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    include: { order: { include: { payment: true } }, product: { select: { creatorId: true } } },
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
    giftsExpired += 1;
  }

  // Expired IDENTITY verifications (see lib/verification/applications.ts) —
  // an unrelated domain sharing this cron for the same reason gifts do: no
  // persistent worker process exists in this build, and a fourth Hobby-plan
  // cron slot isn't worth spending on something this infrequent.
  const verificationsExpired = await sweepExpiredVerifications();

  return NextResponse.json({ swept, giftsExpired, verificationsExpired });
}
