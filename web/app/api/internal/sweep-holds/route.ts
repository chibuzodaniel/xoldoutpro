import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { releaseReservation } from "@/lib/commerce/stock";

export const runtime = "nodejs";

const HOLD_MINUTES = 10;

/**
 * PRD §7.2: a failed or abandoned payment releases its stock hold, "hold
 * duration in the order of ten minutes". No persistent worker process runs
 * in this build (see DECISIONS.md) — call this from an external scheduler
 * (Vercel Cron, an OS cron hitting curl, etc.) every few minutes instead.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (!secret || secret !== process.env.INTERNAL_CRON_SECRET) {
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
