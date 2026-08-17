import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth/session";
import { db } from "@/lib/db";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// PRD §13: Analytics carries units, fans, conversion, and retention — no
// Naira amounts (those live in Wallet only). Scarcity metrics (sell-through,
// time to sell out, sell-out rate) are what teach an artist how to price and
// size their next drop, and are required in the MVP alongside unit counts.
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser(req);

    const [products, orders, fans, newFans30d] = await Promise.all([
      db.product.findMany({
        where: { creatorId: user.id, status: { not: "DRAFT" } },
        select: { id: true, title: true, type: true, publishedAt: true, stockPolicy: { select: { cap: true, sold: true, soldOutAt: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.order.findMany({
        where: { status: "PAID", items: { some: { product: { creatorId: user.id } } } },
        select: { buyerId: true },
      }),
      db.follow.count({ where: { followedId: user.id } }),
      db.follow.count({ where: { followedId: user.id, createdAt: { gte: new Date(Date.now() - THIRTY_DAYS_MS) } } }),
    ]);

    const productStats = products.map((p) => {
      const cap = p.stockPolicy?.cap ?? null;
      const sold = p.stockPolicy?.sold ?? 0;
      const soldOutAt = p.stockPolicy?.soldOutAt ?? null;
      const sellThroughPct = cap ? Math.round((sold / cap) * 100) : null;
      const timeToSellOutHours =
        soldOutAt && p.publishedAt ? Math.round((soldOutAt.getTime() - p.publishedAt.getTime()) / (60 * 60 * 1000)) : null;
      return { id: p.id, title: p.title, type: p.type, cap, sold, soldOutAt, sellThroughPct, timeToSellOutHours };
    });

    const unitsSold = productStats.reduce((sum, p) => sum + p.sold, 0);
    const cappedProducts = productStats.filter((p) => p.cap !== null);
    const soldOutCapped = cappedProducts.filter((p) => p.soldOutAt !== null);
    const sellOutRatePct = cappedProducts.length ? Math.round((soldOutCapped.length / cappedProducts.length) * 100) : null;

    const buyerOrderCounts = new Map<string, number>();
    for (const o of orders) buyerOrderCounts.set(o.buyerId, (buyerOrderCounts.get(o.buyerId) ?? 0) + 1);
    const totalCustomers = buyerOrderCounts.size;
    const returningCustomers = [...buyerOrderCounts.values()].filter((n) => n > 1).length;

    const topProducts = [...productStats].sort((a, b) => b.sold - a.sold).slice(0, 5);

    return NextResponse.json({
      totals: { unitsSold, fans, newFans30d, totalCustomers, returningCustomers, sellOutRatePct },
      topProducts,
      products: productStats,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
