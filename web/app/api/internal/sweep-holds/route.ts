import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releaseReservation } from "@/lib/commerce/stock";

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
 * Known gap: the Hobby plan caps crons at once/day, so this currently runs
 * far less often than the ~10-minute target — an abandoned hold can sit for
 * up to 24h instead of ~10min before its stock is released. Fix by moving
 * to Pro (unlocks per-minute schedules) or an external scheduler hitting
 * this same URL more often; the secret check doesn't care which triggers it.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  return NextResponse.json({ swept });
}
